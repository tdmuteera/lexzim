"use client";

import { useCallback, useEffect, useState } from "react";
import { Can } from "@/components/auth/Can";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

type ProcedureItem = {
  id: string;
  title: string;
  description: string | null;
  dueAt: string | null;
  status: string;
  statusLabel: string;
  assignedTo: string | null;
  assigneeName: string | null;
  isOverdue: boolean;
  completedAt: string | null;
};

type Assignee = { id: string; fullName: string };

type FormState = {
  title: string;
  description: string;
  dueAt: string;
  assignedTo: string;
};

const emptyForm: FormState = {
  title: "",
  description: "",
  dueAt: "",
  assignedTo: "",
};

type MatterProceduresPanelProps = {
  matterId: string;
};

export function MatterProceduresPanel({ matterId }: MatterProceduresPanelProps) {
  const [items, setItems] = useState<ProcedureItem[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [filter, setFilter] = useState<"open" | "all">("open");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/matters/${matterId}/procedures?includeAssignees=1`,
        { credentials: "include" },
      );
      const body = (await res.json()) as {
        ok: boolean;
        data?: { items: ProcedureItem[]; assignees?: Assignee[] };
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not load procedures.");
        setItems([]);
        return;
      }
      setItems(body.data?.items ?? []);
      if (body.data?.assignees) setAssignees(body.data.assignees);
    } catch {
      setError("Could not load procedures.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [matterId]);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(item: ProcedureItem) {
    setEditingId(item.id);
    setForm({
      title: item.title,
      description: item.description ?? "",
      dueAt: item.dueAt ? toDatetimeLocal(item.dueAt) : "",
      assignedTo: item.assignedTo ?? "",
    });
    setShowForm(true);
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload = {
      title: form.title,
      description: form.description || null,
      dueAt: form.dueAt || null,
      assignedTo: form.assignedTo || null,
    };
    try {
      const url = editingId
        ? `/api/procedures/${editingId}`
        : `/api/matters/${matterId}/procedures`;
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not save procedure.");
        return;
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      await load();
    } catch {
      setError("Could not save procedure.");
    } finally {
      setSaving(false);
    }
  }

  async function onStatus(id: string, status: "todo" | "done" | "cancelled") {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/procedures/${id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      const body = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not update procedure.");
        return;
      }
      await load();
    } catch {
      setError("Could not update procedure.");
    } finally {
      setSaving(false);
    }
  }

  const visible = items.filter((item) =>
    filter === "open" ? item.status === "todo" : true,
  );
  const overdueCount = items.filter((i) => i.isOverdue).length;

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "0.75rem",
          marginBottom: "0.75rem",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h4 style={{ margin: 0 }}>Pending procedures</h4>
          <p className="muted" style={{ margin: "0.25rem 0 0" }}>
            {overdueCount > 0
              ? `${overdueCount} overdue`
              : "Track deadlines and next steps for this matter"}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <select
            className="filter-select"
            value={filter}
            onChange={(e) => setFilter(e.target.value as "open" | "all")}
            aria-label="Filter procedures"
          >
            <option value="open">Open only</option>
            <option value="all">All</option>
          </select>
          <Can permission="matters.edit">
            <Button size="sm" onClick={openCreate}>
              Add procedure
            </Button>
          </Can>
        </div>
      </div>

      {error ? (
        <p style={{ color: "var(--danger)", marginBottom: "0.75rem" }}>{error}</p>
      ) : null}

      {showForm ? (
        <form
          onSubmit={onSave}
          className="panel"
          style={{ padding: "1rem", marginBottom: "1rem" }}
        >
          <h4 style={{ marginTop: 0 }}>{editingId ? "Edit procedure" : "New procedure"}</h4>
          <div className="form-group">
            <label htmlFor="proc-title">Title</label>
            <input
              id="proc-title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="proc-desc">Description</label>
            <textarea
              id="proc-desc"
              rows={2}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label htmlFor="proc-due">Due</label>
              <input
                id="proc-due"
                type="datetime-local"
                value={form.dueAt}
                onChange={(e) => setForm((f) => ({ ...f, dueAt: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label htmlFor="proc-assignee">Assignee</label>
              <select
                id="proc-assignee"
                value={form.assignedTo}
                onChange={(e) => setForm((f) => ({ ...f, assignedTo: e.target.value }))}
              >
                <option value="">Unassigned</option>
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.fullName}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={saving}
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {loading ? (
        <p className="muted">Loading procedures…</p>
      ) : visible.length === 0 ? (
        <p className="muted">No procedures to show.</p>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Title</th>
                <th>Due</th>
                <th>Assignee</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => (
                <tr
                  key={item.id}
                  style={
                    item.isOverdue
                      ? { background: "rgba(168, 83, 69, 0.08)" }
                      : undefined
                  }
                >
                  <td>
                    <div style={{ fontWeight: 600 }}>{item.title}</div>
                    {item.description ? (
                      <div className="muted" style={{ fontSize: "0.85rem" }}>
                        {item.description}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    {item.dueAt ? (
                      <span style={item.isOverdue ? { color: "var(--danger)", fontWeight: 600 } : undefined}>
                        {new Date(item.dueAt).toLocaleString()}
                        {item.isOverdue ? " · Overdue" : ""}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{item.assigneeName ?? "—"}</td>
                  <td>
                    <Badge
                      tone={
                        item.isOverdue
                          ? "danger"
                          : item.status === "done"
                            ? "open"
                            : item.status === "cancelled"
                              ? "closed"
                              : "pending"
                      }
                    >
                      {item.isOverdue ? "Overdue" : item.statusLabel}
                    </Badge>
                  </td>
                  <td>
                    <Can permission="matters.edit">
                      <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                        {item.status === "todo" ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={saving}
                              onClick={() => onStatus(item.id, "done")}
                            >
                              Done
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={saving}
                              onClick={() => onStatus(item.id, "cancelled")}
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={saving}
                              onClick={() => openEdit(item)}
                            >
                              Edit
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={saving}
                            onClick={() => onStatus(item.id, "todo")}
                          >
                            Reopen
                          </Button>
                        )}
                      </div>
                    </Can>
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

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
