"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Can } from "@/components/auth/Can";
import { Button } from "@/components/ui/Button";
import { SortableTh } from "@/components/ui/SortableTh";
import {
  CLIENT_DOC_CATEGORIES,
  clientDocCategoryLabel,
  isClientDocCategory,
} from "@/lib/clients/doc-categories";
import { formatBytes } from "@/lib/documents/serialize";
import { useTableSort } from "@/lib/ui/table-sort";

type DocumentItem = {
  id: string;
  title: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number | null;
  docType: string;
  matterId: string | null;
  matterNumber?: string | null;
  matterTitle?: string | null;
  createdByName: string | null;
  createdAt: string;
};

type PendingOther = { file: File; title: string };

export function ClientDocumentsPanel({ clientId }: { clientId: string }) {
  const [items, setItems] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState("kyc_id_document");
  const [title, setTitle] = useState("");
  const [pendingOthers, setPendingOthers] = useState<PendingOther[]>([]);
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

  async function uploadOne(file: File, docTitle: string, docType: string) {
    const form = new FormData();
    form.append("file", file);
    form.append("title", docTitle);
    form.append("docType", docType);
    const res = await fetch(`/api/clients/${clientId}/documents`, {
      method: "POST",
      credentials: "include",
      body: form,
    });
    const body = (await res.json()) as { ok: boolean; error?: { message: string } };
    if (!res.ok || !body.ok) {
      throw new Error(body.error?.message ?? "Upload failed.");
    }
  }

  async function onUpload(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (category === "other") {
        if (!pendingOthers.length) {
          setError("Choose one or more files, then name each before uploading.");
          return;
        }
        for (let i = 0; i < pendingOthers.length; i += 1) {
          const row = pendingOthers[i]!;
          const name =
            row.title.trim() ||
            row.file.name.replace(/\.[^.]+$/, "") ||
            `Other document ${i + 1}`;
          await uploadOne(row.file, name, "other");
        }
        setPendingOthers([]);
      } else {
        const file = fileRef.current?.files?.[0];
        if (!file) {
          setError("Choose a file to upload.");
          return;
        }
        const label =
          CLIENT_DOC_CATEGORIES.find((c) => c.value === category)?.label ?? "Document";
        const docTitle = title.trim() || label;
        await uploadOne(file, docTitle, category);
        setTitle("");
        if (fileRef.current) fileRef.current.value = "";
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
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

  const accessors = useMemo(
    () => ({
      type: (r: DocumentItem) =>
        isClientDocCategory(r.docType) || r.docType === "other"
          ? clientDocCategoryLabel(r.docType)
          : r.matterId
            ? "Matter file"
            : clientDocCategoryLabel(r.docType),
      title: (r: DocumentItem) => r.title,
      file: (r: DocumentItem) => r.fileName,
      matter: (r: DocumentItem) =>
        r.matterNumber
          ? `${r.matterNumber}${r.matterTitle ? ` · ${r.matterTitle}` : ""}`
          : "",
      size: (r: DocumentItem) => r.sizeBytes ?? 0,
      added: (r: DocumentItem) => r.createdAt,
    }),
    [],
  );
  const { sortedRows, sortKey, sortDir, toggleSort } = useTableSort(items, accessors, {
    key: "added",
    dir: "desc",
  });

  return (
    <div>
      <p className="muted" style={{ marginTop: 0 }}>
        Link uploads to KYC document types (ID, proof of address, and so on), or choose Other to
        upload several files and name each one. Matter uploads for this client also appear here.
      </p>
      <Can permission="documents.manage">
        <form
          onSubmit={(e) => void onUpload(e)}
          className="toolbar"
          style={{ marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}
        >
          <select
            className="filter-select"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPendingOthers([]);
              if (fileRef.current) fileRef.current.value = "";
            }}
          >
            {CLIENT_DOC_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          {category === "other" ? (
            <>
              <input
                ref={fileRef}
                type="file"
                multiple
                aria-label="Other documents"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  setPendingOthers(
                    files.map((file, i) => ({
                      file,
                      title: file.name.replace(/\.[^.]+$/, "") || `Document ${i + 1}`,
                    })),
                  );
                }}
              />
              {pendingOthers.map((row, idx) => (
                <input
                  key={`${row.file.name}-${idx}`}
                  className="search-input"
                  value={row.title}
                  onChange={(e) => {
                    const next = [...pendingOthers];
                    next[idx] = { ...row, title: e.target.value };
                    setPendingOthers(next);
                  }}
                  placeholder={`Name for file ${idx + 1}`}
                  style={{ minWidth: "12rem" }}
                />
              ))}
            </>
          ) : (
            <>
              <input
                className="search-input"
                placeholder="Title (optional)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <input ref={fileRef} type="file" aria-label="Client document file" />
            </>
          )}
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? "Uploading…" : category === "other" ? "Upload files" : "Add document"}
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
                <SortableTh label="Type" columnKey="type" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                <SortableTh label="Title" columnKey="title" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                <SortableTh label="File" columnKey="file" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                <SortableTh label="Matter" columnKey="matter" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                <SortableTh label="Size" columnKey="size" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                <SortableTh label="Added" columnKey="added" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((item) => (
                <tr key={item.id}>
                  <td>
                    {isClientDocCategory(item.docType) || item.docType === "other"
                      ? clientDocCategoryLabel(item.docType)
                      : item.matterId
                        ? "Matter file"
                        : clientDocCategoryLabel(item.docType)}
                  </td>
                  <td>{item.title}</td>
                  <td>{item.fileName}</td>
                  <td>
                    {item.matterNumber
                      ? `${item.matterNumber}${item.matterTitle ? ` · ${item.matterTitle}` : ""}`
                      : "—"}
                  </td>
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
