"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Can } from "@/components/auth/Can";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatBytes } from "@/lib/documents/serialize";

type ReportItem = {
  id: string;
  title: string;
  reportDate: string;
  authorDisplay: string | null;
  eventName: string | null;
  fileName: string;
  byteSize: number | null;
  createdByName: string | null;
  createdAt: string;
};

type StaffOption = { id: string; fullName: string };

export function KnowledgeReportsView() {
  const [items, setItems] = useState<ReportItem[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [reportDate, setReportDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [authorUserId, setAuthorUserId] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [eventName, setEventName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/knowledge/reports", { credentials: "include" });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { items: ReportItem[] };
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not load reports.");
        setItems([]);
        return;
      }
      setItems(body.data?.items ?? []);
    } catch {
      setError("Could not load reports.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/workflow/assignees", { credentials: "include" });
        const body = (await res.json()) as {
          ok?: boolean;
          data?: { items?: StaffOption[] };
        };
        if (!cancelled && res.ok && body.data?.items) {
          setStaff(body.data.items);
        }
      } catch {
        /* optional picker */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
      form.append("title", title.trim() || file.name);
      form.append("reportDate", reportDate);
      if (authorUserId) form.append("authorUserId", authorUserId);
      if (authorName.trim()) form.append("authorName", authorName.trim());
      if (eventName.trim()) form.append("eventName", eventName.trim());

      const res = await fetch("/api/knowledge/reports", {
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
      setAuthorName("");
      setEventName("");
      setAuthorUserId("");
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
      const res = await fetch(`/api/knowledge/reports/${id}/download`, {
        credentials: "include",
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { signedUrl: string };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data?.signedUrl) {
        setError(body.error?.message ?? "Could not download report.");
        return;
      }
      window.open(body.data.signedUrl, "_blank", "noopener,noreferrer");
    } catch {
      setError("Could not download report.");
    }
  }

  return (
    <section className="view active scrollable" aria-label="Knowledge reports">
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Knowledge reports</h3>
            <p className="panel-subtitle muted">
              Event, training, and business-development reports. Separate from AI knowledge packs.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => load()} disabled={loading}>
            Refresh
          </Button>
        </div>
        <div className="panel-body">
          <Can permission="knowledge.reports.manage">
            <form
              onSubmit={onUpload}
              className="toolbar"
              style={{ flexWrap: "wrap", marginBottom: "1rem", gap: "0.5rem" }}
            >
              <input
                className="search-input"
                placeholder="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                style={{ minWidth: "160px" }}
              />
              <input
                className="search-input"
                type="date"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                required
                aria-label="Report date"
              />
              <select
                className="filter-select"
                value={authorUserId}
                onChange={(e) => setAuthorUserId(e.target.value)}
                aria-label="Author (user)"
              >
                <option value="">Author: free text →</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName}
                  </option>
                ))}
              </select>
              <input
                className="search-input"
                placeholder="Author name (if not listed)"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                style={{ minWidth: "140px" }}
              />
              <input
                className="search-input"
                placeholder="Event name (optional)"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                style={{ minWidth: "140px" }}
              />
              <input ref={fileRef} type="file" required aria-label="Report file" />
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? "Uploading…" : "Upload"}
              </Button>
            </form>
          </Can>

          {error ? (
            <p role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem" }}>
              {error}
            </p>
          ) : null}

          {loading && items.length === 0 ? (
            <p className="muted" style={{ fontSize: "0.85rem" }}>
              Loading reports…
            </p>
          ) : null}

          {!loading && items.length === 0 ? (
            <EmptyState
              title="No knowledge reports yet"
              detail="Upload conference, training, or BD reports for the firm."
            />
          ) : (
            <div className="table-wrap">
              <table className="data data-dense">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Date</th>
                    <th>Author</th>
                    <th>Event</th>
                    <th>File</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.title}</td>
                      <td>{item.reportDate}</td>
                      <td>{item.authorDisplay ?? "—"}</td>
                      <td className="muted">{item.eventName ?? "—"}</td>
                      <td>
                        {item.fileName}
                        {item.byteSize != null ? (
                          <div className="muted finance-cell-sub">
                            {formatBytes(item.byteSize)}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onDownload(item.id)}
                        >
                          Download
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
