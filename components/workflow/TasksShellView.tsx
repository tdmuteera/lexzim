"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { WorkflowModuleNav } from "@/components/workflow/WorkflowModuleNav";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

type TaskItem = {
  id: string;
  title: string;
  description: string | null;
  assigneeUserId: string;
  assigneeName: string | null;
  assignerUserId: string;
  assignerName: string | null;
  dueAt: string | null;
  priority: string;
  status: string;
  completionFeedback: string | null;
  completedAt: string | null;
  createdAt: string;
  overdue: boolean;
};

type Assignee = { id: string; fullName: string; email: string };

type Counts = {
  myPending: number;
  assignedByMePending: number;
  overdue: number;
  doneRecently: number;
};

type Scope = "mine" | "assigned_by_me" | "completed";

function formatShortDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function todayInput() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function priorityTone(priority: string) {
  if (priority === "high") return "danger" as const;
  if (priority === "low") return "closed" as const;
  return "pending" as const;
}

export function TasksShellView() {
  const { user } = useAuth();
  const [scope, setScope] = useState<Scope>("mine");
  const [items, setItems] = useState<TaskItem[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [completeId, setCompleteId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeUserId, setAssigneeUserId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [priority, setPriority] = useState("normal");

  const loadAssignees = useCallback(async () => {
    const res = await fetch("/api/workflow/assignees", { credentials: "include" });
    const body = (await res.json()) as {
      ok?: boolean;
      data?: { items: Assignee[] };
    };
    if (res.ok && body.ok && body.data) {
      setAssignees(body.data.items);
      if (!assigneeUserId && user?.id) {
        setAssigneeUserId(user.id);
      }
    }
  }, [assigneeUserId, user?.id]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ scope, counts: "1" });
      const res = await fetch(`/api/workflow/tasks?${params.toString()}`, {
        credentials: "include",
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { items: TaskItem[]; counts?: Counts };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Could not load tasks.");
        return;
      }
      setItems(body.data.items);
      if (body.data.counts) setCounts(body.data.counts);
    } catch {
      setError("Could not load tasks.");
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    void loadAssignees();
  }, [loadAssignees]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/workflow/tasks", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: description || null,
          assigneeUserId,
          dueAt: dueAt ? new Date(`${dueAt}T17:00:00`).toISOString() : null,
          priority,
        }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not create task.");
        return;
      }
      setFormOpen(false);
      setTitle("");
      setDescription("");
      setDueAt("");
      setPriority("normal");
      await load();
    } catch {
      setError("Could not create task.");
    } finally {
      setSaving(false);
    }
  }

  async function onComplete(taskId: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/workflow/tasks/${taskId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete", feedback: feedback || null }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not complete task.");
        return;
      }
      setCompleteId(null);
      setFeedback("");
      await load();
    } catch {
      setError("Could not complete task.");
    } finally {
      setSaving(false);
    }
  }

  async function onReopen(taskId: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/workflow/tasks/${taskId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reopen" }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not reopen task.");
        return;
      }
      await load();
    } catch {
      setError("Could not reopen task.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="view active scrollable" aria-label="Tasks">
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Tasks</h3>
            <p className="muted" style={{ marginTop: "0.25rem" }}>
              Assign work across the firm. Completions notify the assigner.
            </p>
          </div>
          <div className="panel-actions">
            <Button type="button" size="sm" onClick={() => setFormOpen((v) => !v)}>
              {formOpen ? "Close" : "New task"}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
              Refresh
            </Button>
          </div>
        </div>
        <div className="panel-body">
          <WorkflowModuleNav />

          {counts ? (
            <div className="toolbar" style={{ marginTop: "1rem", gap: "0.75rem", flexWrap: "wrap" }}>
              <Badge tone="pending">My pending: {counts.myPending}</Badge>
              <Badge tone="closed">Assigned by me: {counts.assignedByMePending}</Badge>
              <Badge tone={counts.overdue > 0 ? "danger" : "closed"}>
                Overdue: {counts.overdue}
              </Badge>
              <Badge tone="open">Done (7d): {counts.doneRecently}</Badge>
            </div>
          ) : null}

          <div className="toolbar" style={{ marginTop: "1rem", marginBottom: "1rem" }}>
            <button
              type="button"
              className={`tab-btn${scope === "mine" ? " active" : ""}`}
              onClick={() => setScope("mine")}
            >
              My tasks
            </button>
            <button
              type="button"
              className={`tab-btn${scope === "assigned_by_me" ? " active" : ""}`}
              onClick={() => setScope("assigned_by_me")}
            >
              Assigned by me
            </button>
            <button
              type="button"
              className={`tab-btn${scope === "completed" ? " active" : ""}`}
              onClick={() => setScope("completed")}
            >
              Completed
            </button>
          </div>

          {error ? <p className="form-error" role="alert">{error}</p> : null}

          {formOpen ? (
            <form
              className="panel"
              style={{ padding: "1rem", marginBottom: "1rem" }}
              onSubmit={onCreate}
            >
              <h4 style={{ marginBottom: "0.75rem" }}>New task</h4>
              <div className="form-grid" style={{ display: "grid", gap: "0.75rem", maxWidth: "640px" }}>
                <label>
                  Title
                  <input
                    className="filter-input"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Assignee
                  <select
                    className="filter-select"
                    value={assigneeUserId}
                    onChange={(e) => setAssigneeUserId(e.target.value)}
                    required
                  >
                    <option value="">Select…</option>
                    {assignees.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.fullName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Due date
                  <input
                    className="filter-input"
                    type="date"
                    value={dueAt}
                    min={todayInput()}
                    onChange={(e) => setDueAt(e.target.value)}
                  />
                </label>
                <label>
                  Priority
                  <select
                    className="filter-select"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                  </select>
                </label>
                <label style={{ gridColumn: "1 / -1" }}>
                  Description
                  <textarea
                    className="filter-input"
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </label>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
                <Button type="submit" size="sm" disabled={saving}>
                  {saving ? "Saving…" : "Assign task"}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setFormOpen(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : null}

          {loading ? (
            <p className="muted">Loading tasks…</p>
          ) : items.length === 0 ? (
            <EmptyState
              title="No tasks here"
              detail="Create a task and assign it to any active employee."
              icon="check"
            />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Task</th>
                    <th>Assignee</th>
                    <th>Assigner</th>
                    <th>Due</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <strong>{t.title}</strong>
                        {t.description ? (
                          <div className="muted" style={{ fontSize: "0.85rem" }}>
                            {t.description}
                          </div>
                        ) : null}
                        {t.completionFeedback ? (
                          <div className="muted" style={{ fontSize: "0.85rem", marginTop: "0.25rem" }}>
                            Feedback: {t.completionFeedback}
                          </div>
                        ) : null}
                      </td>
                      <td>{t.assigneeName ?? "—"}</td>
                      <td>{t.assignerName ?? "—"}</td>
                      <td>
                        {formatShortDate(t.dueAt)}
                        {t.overdue ? (
                          <>
                            {" "}
                            <Badge tone="danger">Overdue</Badge>
                          </>
                        ) : null}
                      </td>
                      <td>
                        <Badge tone={priorityTone(t.priority)}>{t.priority}</Badge>
                      </td>
                      <td>
                        <Badge tone={t.status === "done" ? "open" : "pending"}>
                          {t.status}
                        </Badge>
                      </td>
                      <td>
                        {t.status === "pending" &&
                        (t.assigneeUserId === user?.id || t.assignerUserId === user?.id) ? (
                          completeId === t.id ? (
                            <div style={{ display: "grid", gap: "0.35rem", minWidth: "180px" }}>
                              <textarea
                                className="filter-input"
                                rows={2}
                                placeholder="Completion feedback (optional)"
                                value={feedback}
                                onChange={(e) => setFeedback(e.target.value)}
                              />
                              <div style={{ display: "flex", gap: "0.35rem" }}>
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={saving}
                                  onClick={() => void onComplete(t.id)}
                                >
                                  Confirm
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setCompleteId(null);
                                    setFeedback("");
                                  }}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setCompleteId(t.id)}
                            >
                              Complete
                            </Button>
                          )
                        ) : null}
                        {t.status === "done" && t.assignerUserId === user?.id ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={saving}
                            onClick={() => void onReopen(t.id)}
                          >
                            Reopen
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="muted" style={{ marginTop: "1rem", fontSize: "0.9rem" }}>
            Approvals for leave, advances, and invoices live in{" "}
            <Link href="/workflow/approvals">Approvals</Link>.
          </p>
        </div>
      </div>
    </section>
  );
}
