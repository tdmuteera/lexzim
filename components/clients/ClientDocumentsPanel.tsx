"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Can } from "@/components/auth/Can";
import { Button } from "@/components/ui/Button";
import { formatBytes } from "@/lib/documents/serialize";

type DocumentItem = {
  id: string;
  title: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number | null;
  createdByName: string | null;
  createdAt: string;
};

export function ClientDocumentsPanel({ clientId }: { clientId: string }) {
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
      const res = await fetch(`/api/clients/${clientId}/documents`, {
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
  }, [clientId]);

  useEffect(() => {
    void load();
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
      const res = await fetch(`/api/clients/${clientId}/documents`, {
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
      const res = await fetch(`/api/documents/${id}/download`, { credentials: "include" });
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

  return (
    <div>
      <p className="muted" style={{ marginTop: 0 }}>
        Files on this client (identity, KYC scans, correspondence). Matter files still live on
        each matter.
      </p>
      <Can permission="documents.manage">
        <form onSubmit={onUpload} className="toolbar" style={{ marginBottom: "1rem", flexWrap: "wrap" }}>
          <input
            className="search-input"
            placeholder="Title (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input ref={fileRef} type="file" aria-label="Client document file" />
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? "Uploading…" : "Add document"}
          </Button>
        </form>
      </Can>
      {error ? <p style={{ color: "var(--danger)" }}>{error}</p> : null}
      {loading ? (
        <p className="muted">Loading documents…</p>
      ) : items.length === 0 ? (
        <p className="muted">No client documents yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Title</th>
                <th>File</th>
                <th>Size</th>
                <th>Added</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.title}</td>
                  <td>{item.fileName}</td>
                  <td>{formatBytes(item.sizeBytes)}</td>
                  <td>
                    {new Date(item.createdAt).toLocaleString()}
                    {item.createdByName ? ` · ${item.createdByName}` : ""}
                  </td>
                  <td>
                    <Button size="sm" variant="outline" onClick={() => void onDownload(item.id)}>
                      View
                    </Button>
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
