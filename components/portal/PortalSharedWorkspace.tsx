"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatDateTime } from "@/lib/format/dates";

type SharedMatter = {
  id: string;
  title: string;
  status: string;
  areaOfLaw: string;
  matterNumber: string | null;
  nextHearingAt: string | null;
  permission: string;
  sharedAt: string;
};

type SharedDocument = {
  id: string;
  title: string;
  fileName: string;
  mimeType: string;
  matterId: string;
  sizeBytes: number | null;
  permission: string;
  sharedAt: string;
};

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    prospective: "Prospective",
    open: "Open",
    on_hold: "On hold",
    closed: "Closed",
    archived: "Archived",
  };
  return map[status] ?? status;
}

function when(iso: string | null): string {
  if (!iso) return "Not set";
  const formatted = formatDateTime(iso);
  return formatted === "—" ? "Not set" : formatted;
}

export function PortalSharedWorkspace() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [matters, setMatters] = useState<SharedMatter[]>([]);
  const [documents, setDocuments] = useState<SharedDocument[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [uploadingMatterId, setUploadingMatterId] = useState<string | null>(null);
  const [uploadMatterId, setUploadMatterId] = useState("");
  const [exporting, setExporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadableMatters = matters.filter((m) => m.permission === "read_upload");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/me/shares", { credentials: "include" });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { matters: SharedMatter[]; documents: SharedDocument[] };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Could not load shared items.");
        setMatters([]);
        setDocuments([]);
        return;
      }
      setMatters(body.data.matters);
      setDocuments(body.data.documents);
      const firstUpload = body.data.matters.find((m) => m.permission === "read_upload");
      if (firstUpload) setUploadMatterId((prev) => prev || firstUpload.id);
    } catch {
      setError("Could not load shared items.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function downloadDoc(id: string) {
    setDownloadingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/portal/documents/${id}/download`, {
        credentials: "include",
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { signedUrl: string; fileName: string };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data?.signedUrl) {
        setError(body.error?.message ?? "Download failed.");
        return;
      }
      window.open(body.data.signedUrl, "_blank", "noopener,noreferrer");
    } catch {
      setError("Download failed.");
    } finally {
      setDownloadingId(null);
    }
  }

  async function uploadFile() {
    const file = fileRef.current?.files?.[0];
    if (!file || !uploadMatterId) {
      setError("Choose a matter and a file (PDF, DOCX, image, or text, max 25 MB).");
      return;
    }
    setUploadingMatterId(uploadMatterId);
    setError(null);
    setOkMsg(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/portal/matters/${uploadMatterId}/inbox`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { note?: string };
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Upload failed.");
        return;
      }
      setOkMsg(body.data?.note ?? "Upload received by your firm.");
      if (fileRef.current) fileRef.current.value = "";
    } catch {
      setError("Upload failed.");
    } finally {
      setUploadingMatterId(null);
    }
  }

  async function downloadMyData() {
    setExporting(true);
    setError(null);
    setOkMsg(null);
    try {
      const res = await fetch("/api/portal/me/export", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message: string };
        } | null;
        setError(body?.error?.message ?? "Export failed.");
        return;
      }
      const blob = await res.blob();
      const headerName = res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1];
      const fileName = headerName ?? `lexzim-portal-export-${Date.now()}.json`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setOkMsg("Portal data export downloaded.");
    } catch {
      setError("Export failed.");
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return <p className="muted">Loading shared matters…</p>;
  }

  return (
    <div className="portal-workspace">
      {error ? (
        <p style={{ color: "var(--danger, #b42318)", margin: 0 }}>{error}</p>
      ) : null}
      {okMsg ? (
        <p style={{ color: "var(--success, green)", margin: 0 }}>{okMsg}</p>
      ) : null}

      <section className="portal-card">
        <h2>Shared matters</h2>
        <p className="muted" style={{ margin: 0 }}>
          Only matters your firm explicitly shared with you. High-level status only. No internal
          timelines, trust ledgers, or AI advice here.
        </p>
        {matters.length === 0 ? (
          <p className="muted">Nothing shared yet (share-nothing default).</p>
        ) : (
          <ul className="portal-list">
            {matters.map((m) => (
              <li key={m.id}>
                <div className="portal-list-title">{m.title}</div>
                <div className="muted portal-list-meta">
                  Status: {statusLabel(m.status)}
                  {" · "}
                  Area: {m.areaOfLaw}
                  {m.matterNumber ? ` · Ref: ${m.matterNumber}` : ""}
                  {" · "}
                  Next hearing: {when(m.nextHearingAt)}
                  {m.permission === "read_upload" ? " · Uploads allowed" : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="portal-card">
        <h2>Shared documents</h2>
        <p className="muted" style={{ margin: 0 }}>
          Downloads use a short-lived link. Only documents shared to you are listed.
        </p>
        {documents.length === 0 ? (
          <p className="muted">No shared documents.</p>
        ) : (
          <ul className="portal-list">
            {documents.map((d) => (
              <li key={d.id} className="portal-list-row">
                <div>
                  <div className="portal-list-title">{d.title}</div>
                  <div className="muted portal-list-meta">{d.fileName}</div>
                </div>
                <button
                  type="button"
                  className="portal-btn"
                  disabled={downloadingId === d.id}
                  onClick={() => void downloadDoc(d.id)}
                >
                  {downloadingId === d.id ? "Preparing…" : "Download"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {uploadableMatters.length > 0 ? (
        <section className="portal-card">
          <h2>Send a file to your firm</h2>
          <p className="muted" style={{ margin: 0 }}>
            Files go to a firm inbox first (not published automatically). Max 25 MB. PDF, Word,
            images, or plain text. Your firm reviews before adding them to the matter file.
          </p>
          <div style={{ display: "grid", gap: "0.65rem", marginTop: "0.85rem", maxWidth: "28rem" }}>
            <label>
              Matter
              <select
                className="portal-select"
                value={uploadMatterId}
                onChange={(e) => setUploadMatterId(e.target.value)}
                disabled={Boolean(uploadingMatterId)}
              >
                {uploadableMatters.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              File
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.gif,.webp,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*,text/plain"
                disabled={Boolean(uploadingMatterId)}
              />
            </label>
            <button
              type="button"
              className="portal-btn"
              disabled={Boolean(uploadingMatterId)}
              onClick={() => void uploadFile()}
            >
              {uploadingMatterId ? "Uploading…" : "Upload to firm inbox"}
            </button>
          </div>
        </section>
      ) : null}

      <aside className="portal-card portal-disclaimer">
        <h2>Important</h2>
        <ul>
          <li>This portal is for shared file access only. It is not legal advice.</li>
          <li>There is no AI legal assistant in the client portal.</li>
          <li>Trust account balances and fee ledgers are not shown here.</li>
          <li>Internal matter timelines and lawyer notes are not shown by default.</li>
          <li>Contact your firm for questions about your matter.</li>
        </ul>
        <button
          type="button"
          className="portal-btn"
          style={{ marginTop: "0.85rem" }}
          disabled={exporting}
          onClick={() => void downloadMyData()}
        >
          {exporting ? "Preparing…" : "Download my portal data"}
        </button>
        <p className="muted" style={{ fontSize: "0.8rem", marginTop: "0.5rem" }}>
          JSON of your portal profile, shares, and inbox uploads (not the firm’s full file).
        </p>
      </aside>
    </div>
  );
}
