"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Can } from "@/components/auth/Can";
import { useAuth } from "@/components/auth/AuthProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SortableTh } from "@/components/ui/SortableTh";
import { AREA_OF_LAW_OPTIONS } from "@/lib/db/mvp-types";
import { canApproveTemplates } from "@/lib/rbac/permissions";
import { useTableSort } from "@/lib/ui/table-sort";

type TemplateItem = {
  id: string;
  title: string;
  areaOfLaw: string;
  description: string | null;
  version: number;
  isActive: boolean;
  isApproved: boolean;
  approvedByName: string | null;
  approvedAt: string | null;
  updatedAt: string;
};

type TemplatesLibraryViewProps = {
  /** When true, omit the outer Documents shell (used inside Documents hub tabs). */
  embedded?: boolean;
};

export function TemplatesLibraryView({ embedded = false }: TemplatesLibraryViewProps) {
  const { user } = useAuth();
  const mayApprove = canApproveTemplates(user);
  const [items, setItems] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [areaOfLaw, setAreaOfLaw] = useState("");
  const [editing, setEditing] = useState<TemplateItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editArea, setEditArea] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [newArea, setNewArea] = useState<(typeof AREA_OF_LAW_OPTIONS)[number]>("Civil");
  const [newDescription, setNewDescription] = useState("");
  const [newFile, setNewFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (areaOfLaw) params.set("areaOfLaw", areaOfLaw);
      const res = await fetch(`/api/templates?${params.toString()}`, {
        credentials: "include",
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: {
          items: TemplateItem[];
          mergeFields?: string[];
        };
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not load templates.");
        setItems([]);
        return;
      }
      setItems(body.data?.items ?? []);
    } catch {
      setError("Could not load templates.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [q, areaOfLaw]);

  useEffect(() => {
    const timer = window.setTimeout(() => load(), 200);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function onSeed() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        credentials: "include",
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { created: string[]; skipped: string[] };
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not seed starters.");
        return;
      }
      await load();
    } catch {
      setError("Could not seed starters.");
    } finally {
      setSaving(false);
    }
  }

  function openEdit(item: TemplateItem) {
    setEditing(item);
    setEditTitle(item.title);
    setEditArea(item.areaOfLaw);
    setEditDescription(item.description ?? "");
    setEditActive(item.isActive);
  }

  async function onSaveMeta(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/templates/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: editTitle,
          areaOfLaw: editArea,
          description: editDescription || null,
          isActive: editActive,
        }),
      });
      const body = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not update template.");
        return;
      }
      setEditing(null);
      await load();
    } catch {
      setError("Could not update template.");
    } finally {
      setSaving(false);
    }
  }

  async function onUploadTemplate(e: React.FormEvent) {
    e.preventDefault();
    if (!newFile) {
      setError("Choose a Word or PDF file to add.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", newFile);
      if (newTitle.trim()) form.append("title", newTitle.trim());
      form.append("areaOfLaw", newArea);
      if (newDescription.trim()) form.append("description", newDescription.trim());
      const res = await fetch("/api/templates/upload", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const body = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not add template.");
        return;
      }
      setNewTitle("");
      setNewDescription("");
      setNewFile(null);
      await load();
    } catch {
      setError("Could not add template.");
    } finally {
      setSaving(false);
    }
  }

  async function onApprove(id: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/templates/${id}/approve`, {
        method: "POST",
        credentials: "include",
      });
      const body = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not approve template.");
        return;
      }
      await load();
    } catch {
      setError("Could not approve template.");
    } finally {
      setSaving(false);
    }
  }

  async function onDownload(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/templates/${id}/download`, {
        credentials: "include",
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { signedUrl: string };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data?.signedUrl) {
        setError(body.error?.message ?? "Could not download template.");
        return;
      }
      window.open(body.data.signedUrl, "_blank", "noopener,noreferrer");
    } catch {
      setError("Could not download template.");
    }
  }

  const sortAccessors = useMemo(
    () => ({
      title: (r: TemplateItem) => r.title,
      area: (r: TemplateItem) => r.areaOfLaw,
      version: (r: TemplateItem) => r.version,
      status: (r: TemplateItem) =>
        `${r.isApproved ? "Approved" : "Unapproved"} ${r.isActive ? "Active" : "Inactive"}`,
    }),
    [],
  );
  const { sortedRows, sortKey, sortDir, toggleSort } = useTableSort(items, sortAccessors, {
    key: "title",
    dir: "asc",
  });

  const body = (
    <>
      {!embedded ? (
        <div className="panel-head">
          <h3>Templates</h3>
          <Can permission="templates.manage">
            <Button size="sm" onClick={onSeed} disabled={saving}>
              {saving ? "Working…" : "Seed Family/Civil/Labour starters"}
            </Button>
          </Can>
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "0.75rem",
            flexWrap: "wrap",
            marginBottom: "1rem",
          }}
        >
          <p className="muted" style={{ margin: 0 }}>
            Firm template library. Client files are on the Client documents tab.
          </p>
          <Can permission="templates.manage">
            <Button size="sm" onClick={onSeed} disabled={saving}>
              {saving ? "Working…" : "Seed Family/Civil/Labour starters"}
            </Button>
          </Can>
        </div>
      )}

      <Can permission="templates.manage">
        <form
          onSubmit={onUploadTemplate}
          className="panel"
          style={{ padding: "1rem", marginBottom: "1rem", background: "var(--bg-3)" }}
        >
          <h4 style={{ marginTop: 0 }}>Add a template</h4>
          <p className="muted" style={{ marginTop: 0 }}>
            Upload a Word or PDF file. It stays unapproved until a lawyer or Managing Partner
            approves it for use on matters.
          </p>
          <div className="grid-2">
            <div className="form-group">
              <label htmlFor="tpl-new-title">Title</label>
              <input
                id="tpl-new-title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Letter of demand"
              />
            </div>
            <div className="form-group">
              <label htmlFor="tpl-new-area">Area of law</label>
              <select
                id="tpl-new-area"
                className="filter-select"
                value={newArea}
                onChange={(e) =>
                  setNewArea(e.target.value as (typeof AREA_OF_LAW_OPTIONS)[number])
                }
              >
                {AREA_OF_LAW_OPTIONS.map((area) => (
                  <option key={area} value={area}>
                    {area}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="tpl-new-desc">Description (optional)</label>
            <input
              id="tpl-new-desc"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="tpl-new-file">File</label>
            <input
              id="tpl-new-file"
              type="file"
              accept=".doc,.docx,.pdf,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => setNewFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? "Uploading…" : "Add template"}
          </Button>
        </form>
      </Can>

      <div className="toolbar">
        <input
          className="search-input"
          placeholder="Search templates…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search templates"
        />
        <select
          className="filter-select"
          value={areaOfLaw}
          onChange={(e) => setAreaOfLaw(e.target.value)}
          aria-label="Filter by area of law"
        >
          <option value="">All areas</option>
          {AREA_OF_LAW_OPTIONS.map((area) => (
            <option key={area} value={area}>
              {area}
            </option>
          ))}
        </select>
        <div className="toolbar-spacer" />
        <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
          Refresh
        </Button>
      </div>

      {error ? (
        <p style={{ color: "var(--danger)", marginBottom: "0.75rem" }}>{error}</p>
      ) : null}

      {editing ? (
        <form
          onSubmit={onSaveMeta}
          className="panel"
          style={{ padding: "1rem", marginBottom: "1rem" }}
        >
          <h4 style={{ marginTop: 0 }}>Edit template metadata</h4>
          <div className="form-group">
            <label htmlFor="tpl-title">Title</label>
            <input
              id="tpl-title"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="tpl-area">Area of law</label>
            <select
              id="tpl-area"
              value={editArea}
              onChange={(e) => setEditArea(e.target.value)}
            >
              {AREA_OF_LAW_OPTIONS.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="tpl-desc">Description</label>
            <textarea
              id="tpl-desc"
              rows={3}
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
            />
          </div>
          <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input
              type="checkbox"
              checked={editActive}
              onChange={(e) => setEditActive(e.target.checked)}
            />
            Active
          </label>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
            <Button type="submit" size="sm" disabled={saving}>
              Save
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={saving}
              onClick={() => setEditing(null)}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {loading ? (
        <p className="muted">Loading templates…</p>
      ) : items.length === 0 ? (
        <p className="muted">
          No templates yet. Add a Word or PDF file above, or seed Family, Civil, and Labour
          starters.
        </p>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <SortableTh
                  label="Title"
                  columnKey="title"
                  activeKey={sortKey}
                  direction={sortDir}
                  onSort={toggleSort}
                />
                <SortableTh
                  label="Area"
                  columnKey="area"
                  activeKey={sortKey}
                  direction={sortDir}
                  onSort={toggleSort}
                />
                <SortableTh
                  label="Version"
                  columnKey="version"
                  activeKey={sortKey}
                  direction={sortDir}
                  onSort={toggleSort}
                />
                <SortableTh
                  label="Status"
                  columnKey="status"
                  activeKey={sortKey}
                  direction={sortDir}
                  onSort={toggleSort}
                />
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{item.title}</div>
                    {item.description ? (
                      <div className="muted" style={{ fontSize: "0.85rem" }}>
                        {item.description}
                      </div>
                    ) : null}
                  </td>
                  <td>{item.areaOfLaw}</td>
                  <td>v{item.version}</td>
                  <td>
                    <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                      {item.isApproved ? (
                        <Badge tone="open">Approved</Badge>
                      ) : (
                        <Badge tone="pending">Unapproved</Badge>
                      )}
                      {!item.isActive ? <Badge tone="closed">Inactive</Badge> : null}
                    </div>
                    {item.approvedByName ? (
                      <div className="muted" style={{ fontSize: "0.8rem", marginTop: "0.25rem" }}>
                        by {item.approvedByName}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                      <Can permission="templates.view">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onDownload(item.id)}
                        >
                          Download
                        </Button>
                      </Can>
                      <Can permission="templates.manage">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={saving}
                          onClick={() => openEdit(item)}
                        >
                          Edit
                        </Button>
                      </Can>
                      {mayApprove && !item.isApproved ? (
                        <Button
                          size="sm"
                          disabled={saving}
                          onClick={() => onApprove(item.id)}
                        >
                          Approve
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );

  if (embedded) {
    return <div aria-label="Templates">{body}</div>;
  }

  return (
    <section className="view active scrollable" aria-label="Templates">
      <div className="panel" style={{ marginBottom: "1rem" }}>
        <div className="panel-body">{body}</div>
      </div>
    </section>
  );
}
