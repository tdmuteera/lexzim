"use client";

import { useCallback, useEffect, useState } from "react";
import { Can } from "@/components/auth/Can";
import { useAuth } from "@/components/auth/AuthProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { AREA_OF_LAW_OPTIONS } from "@/lib/db/mvp-types";

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

export function TemplatesLibraryView() {
  const { user } = useAuth();
  const isManagingPartner = user?.role.code === "managing_partner";
  const [items, setItems] = useState<TemplateItem[]>([]);
  const [mergeFields, setMergeFields] = useState<string[]>([]);
  const [disclaimer, setDisclaimer] = useState("");
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
          disclaimer?: string;
        };
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not load templates.");
        setItems([]);
        return;
      }
      setItems(body.data?.items ?? []);
      setMergeFields(body.data?.mergeFields ?? []);
      setDisclaimer(body.data?.disclaimer ?? "");
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

  return (
    <section className="view active scrollable" aria-label="Documents and templates">
      <div className="panel" style={{ marginBottom: "1rem" }}>
        <div className="panel-head">
          <h3>Template library</h3>
          <Can permission="templates.manage">
            <Button size="sm" onClick={onSeed} disabled={saving}>
              {saving ? "Working…" : "Seed Family/Civil/Labour starters"}
            </Button>
          </Can>
        </div>
        <div className="panel-body">
          <p
            style={{
              background: "rgba(168, 83, 69, 0.08)",
              border: "1px solid rgba(168, 83, 69, 0.25)",
              padding: "0.75rem 1rem",
              marginBottom: "1rem",
              color: "var(--text)",
            }}
          >
            {disclaimer ||
              "Placeholder templates only. A qualified practitioner must review before real use."}
          </p>

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

          {mergeFields.length > 0 ? (
            <p className="muted" style={{ marginBottom: "0.75rem", fontSize: "0.85rem" }}>
              Merge fields (P1-09): {mergeFields.map((f) => `{{${f}}}`).join(", ")}
            </p>
          ) : null}

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
              No templates yet. Managing partners / template managers can seed Family, Civil, and
              Labour starters.
            </p>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Area</th>
                    <th>Version</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
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
                            {isManagingPartner && !item.isApproved ? (
                              <Button
                                size="sm"
                                disabled={saving}
                                onClick={() => onApprove(item.id)}
                              >
                                Approve
                              </Button>
                            ) : null}
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
      </div>
    </section>
  );
}
