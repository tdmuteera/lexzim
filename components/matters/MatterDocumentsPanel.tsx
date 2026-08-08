"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Can } from "@/components/auth/Can";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { MatterGeneratePanel } from "@/components/matters/MatterGeneratePanel";
import { formatBytes } from "@/lib/documents/serialize";

type DocumentItem = {
  id: string;
  title: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number | null;
  docType: string;
  createdByName: string | null;
  createdAt: string;
};

type MatterDocumentsPanelProps = {
  matterId: string;
};

export function MatterDocumentsPanel({ matterId }: MatterDocumentsPanelProps) {
  const [items, setItems] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/matters/${matterId}/documents`, {
        credentials: "include",
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { items: DocumentItem[] };
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not load documents.");
        setItems([]);
        return;
      }
      setItems(body.data?.items ?? []);
    } catch {
      setError("Could not load documents.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [matterId]);

  useEffect(() => {
    load();
  }, [load]);

  async function onUpload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose a file to upload.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      if (title.trim()) form.append("title", title.trim());

      const res = await fetch(`/api/matters/${matterId}/documents`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const body = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Upload failed.");
        return;
      }
      setTitle("");
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch {
      setError("Upload failed. Check your connection.");
    } finally {
      setSaving(false);
    }
  }

  async function onDownload(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/documents/${id}/download`, {
        credentials: "include",
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { signedUrl: string };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data?.signedUrl) {
        setError(body.error?.message ?? "Could not download document.");
        return;
      }
      window.open(body.data.signedUrl, "_blank", "noopener,noreferrer");
    } catch {
      setError("Could not download document.");
    }
  }

  async function onRename(item: DocumentItem) {
    const next = window.prompt("Document title", item.title);
    if (next == null) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === item.title) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title: trimmed }),
      });
      const body = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not rename document.");
        return;
      }
      await load();
    } catch {
      setError("Could not rename document.");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(item: DocumentItem) {
    if (!window.confirm(`Delete “${item.title}”? This cannot be undone.`)) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${item.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const body = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not delete document.");
        return;
      }
      await load();
    } catch {
      setError("Could not delete document.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "0.75rem",
          marginBottom: "0.75rem",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h4 style={{ margin: 0 }}>Documents</h4>
          <p className="muted" style={{ margin: "0.25rem 0 0" }}>
            PDF, DOCX, and images up to 25 MB. Stored under your firm path. Share
            selected files with clients from the Portal tab (explicit per document).
          </p>
        </div>
      </div>

      {error ? (
        <p style={{ color: "var(--danger)", marginBottom: "0.75rem" }}>{error}</p>
      ) : null}

      <MatterGeneratePanel matterId={matterId} onGenerated={() => load()} />

      <Can permission="documents.manage">
        <form
          onSubmit={onUpload}
          className="panel"
          style={{ padding: "1rem", marginBottom: "1rem" }}
        >
          <div className="grid-2">
            <div className="form-group">
              <label htmlFor="doc-file">File</label>
              <input
                id="doc-file"
                ref={fileRef}
                type="file"
                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.gif,.webp,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*,text/plain"
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="doc-title">Title (optional)</label>
              <input
                id="doc-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Defaults to file name"
              />
            </div>
          </div>
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? "Uploading…" : "Upload"}
          </Button>
        </form>
      </Can>

      {loading ? (
        <p className="muted">Loading documents…</p>
      ) : items.length === 0 ? (
        <p className="muted">No documents on this matter yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Title</th>
                <th>Type</th>
                <th>Size</th>
                <th>Uploaded</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{item.title}</div>
                    <div className="muted" style={{ fontSize: "0.85rem" }}>
                      {item.fileName}
                      {item.createdByName ? ` · ${item.createdByName}` : ""}
                    </div>
                  </td>
                  <td>
                    <Badge tone={item.docType === "uploaded" ? "open" : "pending"}>
                      {item.docType}
                    </Badge>
                  </td>
                  <td>{formatBytes(item.sizeBytes)}</td>
                  <td>{new Date(item.createdAt).toLocaleString()}</td>
                  <td>
                    <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                      <Can permission="documents.view">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={saving}
                          onClick={() => onDownload(item.id)}
                        >
                          Download
                        </Button>
                      </Can>
                      <Can permission="documents.manage">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={saving}
                          onClick={() => onRename(item)}
                        >
                          Rename
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={saving}
                          onClick={() => onDelete(item)}
                        >
                          Delete
                        </Button>
                      </Can>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
