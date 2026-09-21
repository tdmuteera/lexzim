"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { WorkflowPageShell } from "@/components/workflow/WorkflowPageShell";
import { WorkflowStatStrip } from "@/components/workflow/WorkflowStatStrip";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SortableTh } from "@/components/ui/SortableTh";
import { useTableSort } from "@/lib/ui/table-sort";

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

function priorityLabel(priority: string) {
  if (priority === "high") return "High";
  if (priority === "low") return "Low";
  return "Normal";
}

function statusLabel(status: string) {
  if (status === "done") return "Done";
  if (status === "pending") return "Pending";
  return status;
}

function resetCreateForm() {
  return {
    title: "",
    description: "",
    assigneeUserId: "",
    dueAt: "",
    priority: "normal",
  };
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
    }
  }, []);

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

  function openCreateForm() {
    const blank = resetCreateForm();
    setTitle(blank.title);
    setDescription(blank.description);
    setAssigneeUserId(blank.assigneeUserId);
    setDueAt(blank.dueAt);
    setPriority(blank.priority);
    setFormOpen(true);
    setError(null);
  }

  function closeCreateForm() {
    setFormOpen(false);
    const blank = resetCreateForm();
    setTitle(blank.title);
    setDescription(blank.description);
    setAssigneeUserId(blank.assigneeUserId);
    setDueAt(blank.dueAt);
    setPriority(blank.priority);
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!assigneeUserId) {
      setError("Choose who should receive this task.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/workflow/tasks", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
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
      closeCreateForm();
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

  const summaryStats = useMemo(() => {
    if (!counts) return [];
    return [
      {
        label: "My pending",
        value: loading ? "—" : counts.myPending,
        icon: "ME",
        hint: "Waiting on you",
      },
      {
        label: "Assigned by me",
        value: loading ? "—" : counts.assignedByMePending,
        icon: "OUT",
        hint: "Still open",
      },
      {
        label: "Overdue",
        value: loading ? "—" : counts.overdue,
        icon: "LATE",
        hint: counts.overdue > 0 ? "Needs attention" : "All on track",
      },
      {
        label: "Done (7 days)",
        value: loading ? "—" : counts.doneRecently,
        icon: "OK",
        hint: "Recently completed",
      },
    ];
  }, [counts, loading]);

  const scopeLabel =
    scope === "mine"
      ? "My tasks"
      : scope === "assigned_by_me"
        ? "Assigned by me"
        : "Completed";

  const sortAccessors = useMemo(
    () => ({
      task: (r: TaskItem) => r.title,
      assignee: (r: TaskItem) => r.assigneeName ?? "",
      assigner: (r: TaskItem) => r.assignerName ?? "",
      due: (r: TaskItem) => r.dueAt,
      priority: (r: TaskItem) => r.priority,
      status: (r: TaskItem) => r.status,
    }),
    [],
  );
  const { sortedRows, sortKey, sortDir, toggleSort } = useTableSort(items, sortAccessors, {
    key: "due",
    dir: "asc",
  });

  return (
    <WorkflowPageShell
      title="Tasks"
      subtitle="Assign work across the firm. When someone completes a task, the assigner is notified."
      ariaLabel="Tasks"
      actions={
        <>
          <Button
            type="button"
            size="sm"
            onClick={() => (formOpen ? closeCreateForm() : openCreateForm())}
          >
            {formOpen ? "Close form" : "New task"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void load()}
            disabled={loading}
          >
            Refresh
          </Button>
        </>
      }
      summary={summaryStats.length > 0 ? <WorkflowStatStrip stats={summaryStats} /> : null}
    >
      <div className="wf-subtabs" role="tablist" aria-label="Task lists">
        <button
          type="button"
          role="tab"
          aria-selected={scope === "mine"}
          className={`tab-btn${scope === "mine" ? " active" : ""}`}
          onClick={() => setScope("mine")}
        >
          My tasks
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={scope === "assigned_by_me"}
          className={`tab-btn${scope === "assigned_by_me" ? " active" : ""}`}
          onClick={() => setScope("assigned_by_me")}
        >
          Assigned by me
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={scope === "completed"}
          className={`tab-btn${scope === "completed" ? " active" : ""}`}
          onClick={() => setScope("completed")}
        >
          Completed
        </button>
      </div>

      {error ? (
        <p className="form-error" role="alert">{error}</p>
      ) : null}

      {formOpen ? (
        <form className="wf-form-panel" onSubmit={onCreate} aria-label="New task form">
          <div className="wf-form-panel-header">
            <h4>Assign a new task</h4>
            <p className="wf-form-hint muted">
              Give a clear title, pick the right person, and add a due date if timing matters.
              The assignee gets a notification; you get one when they mark it done.
            </p>
          </div>
          <div className="wf-form-grid">
            <label className="wf-span-full">
              Task title
              <input
                className="filter-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Prepare witness bundle for hearing"
                required
                maxLength={200}
              />
            </label>
            <label>
              Assign to
              <select
                className="filter-select"
                value={assigneeUserId}
                onChange={(e) => setAssigneeUserId(e.target.value)}
                required
              >
                <option value="">Select employee…</option>
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.fullName}
                    {a.email ? ` · ${a.email}` : ""}
                  </option>
                ))}
              </select>
              <span className="wf-field-hint">Active staff with a LexZim login</span>
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
              <span className="wf-field-hint">Optional. Leave blank for no fixed deadline.</span>
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
            <label className="wf-span-full">
              Description
              <textarea
                className="filter-input"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Context, links, or steps the assignee should follow…"
              />
            </label>
          </div>
          <div className="wf-form-actions">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Assigning…" : "Assign task"}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => closeCreateForm()}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {loading ? (
        <p className="wf-empty-loading">Loading {scopeLabel.toLowerCase()}…</p>
      ) : items.length === 0 ? (
        <EmptyState
          title={`No tasks in ${scopeLabel.toLowerCase()}`}
          detail="Create a task and assign it to any active employee with a login."
          icon="check"
        />
      ) : (
        <div className="wf-table-wrap">
          <table className="data data-dense wf-data-table">
            <thead>
              <tr>
                <SortableTh
                  label="Task"
                  columnKey="task"
                  activeKey={sortKey}
                  direction={sortDir}
                  onSort={toggleSort}
                />
                <SortableTh
                  label="Assignee"
                  columnKey="assignee"
                  activeKey={sortKey}
                  direction={sortDir}
                  onSort={toggleSort}
                />
                <SortableTh
                  label="Assigner"
                  columnKey="assigner"
                  activeKey={sortKey}
                  direction={sortDir}
                  onSort={toggleSort}
                />
                <SortableTh
                  label="Due"
                  columnKey="due"
                  activeKey={sortKey}
                  direction={sortDir}
                  onSort={toggleSort}
                />
                <SortableTh
                  label="Priority"
                  columnKey="priority"
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
                <th />
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((t) => (
                <tr key={t.id}>
                  <td>
                    <div className="wf-cell-primary">{t.title}</div>
                    {t.description ? (
                      <div className="wf-cell-meta">{t.description}</div>
                    ) : null}
                    {t.completionFeedback ? (
                      <div className="wf-cell-meta">
                        Completion note: {t.completionFeedback}
                      </div>
                    ) : null}
                  </td>
                  <td>{t.assigneeName ?? "—"}</td>
                  <td>{t.assignerName ?? "—"}</td>
                  <td>
                    {formatShortDate(t.dueAt)}
                    {t.overdue ? (
                      <div style={{ marginTop: "0.25rem" }}>
                        <Badge tone="danger">Overdue</Badge>
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <Badge tone={priorityTone(t.priority)}>
                      {priorityLabel(t.priority)}
                    </Badge>
                  </td>
                  <td>
                    <Badge tone={t.status === "done" ? "open" : "pending"}>
                      {statusLabel(t.status)}
                    </Badge>
                  </td>
                  <td>
                    <div className="wf-row-actions">
                      {t.status === "pending" &&
                      (t.assigneeUserId === user?.id || t.assignerUserId === user?.id) ? (
                        completeId === t.id ? (
                          <div className="wf-complete-panel">
                            <textarea
                              className="filter-input"
                              rows={2}
                              placeholder="Completion feedback (optional)"
                              value={feedback}
                              onChange={(e) => setFeedback(e.target.value)}
                            />
                            <div className="wf-row-actions">
                              <Button
                                type="button"
                                size="sm"
                                disabled={saving}
                                onClick={() => void onComplete(t.id)}
                              >
                                Confirm done
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
                            Mark done
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
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="wf-footnote">
        Approvals for leave, salary advances, and invoices live in{" "}
        <Link href="/workflow/approvals">Approvals</Link>.
      </p>
    </WorkflowPageShell>
  );
}
