"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { Can } from "@/components/auth/Can";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

type DeadlineItem = {
  id: string;
  title: string;
  dueAt: string;
  status: string;
  notes: string | null;
  calendarEventId: string | null;
  templateId: string | null;
  isOverdue: boolean;
};

type TemplateOption = {
  id: string;
  name: string;
  offsetDays: number;
  defaultEventType: string;
  description: string | null;
};

type MatterDeadlinesPanelProps = {
  matterId: string;
};

function todayInputValue() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function previewDue(trigger: string, offsetDays: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trigger)) return null;
  const [y, m, d] = trigger.split("-").map(Number);
  const due = new Date(y, m - 1, d, 12, 0, 0, 0);
  due.setDate(due.getDate() + offsetDays);
  return due.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function MatterDeadlinesPanel({ matterId }: MatterDeadlinesPanelProps) {
  const [items, setItems] = useState<DeadlineItem[]>([]);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [showApply, setShowApply] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [triggerDate, setTriggerDate] = useState(todayInputValue);
  const [createCalendar, setCreateCalendar] = useState(true);
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [deadRes, tmplRes] = await Promise.all([
        fetch(`/api/matters/${matterId}/deadlines`, { credentials: "include" }),
        fetch("/api/deadline-templates", { credentials: "include" }),
      ]);
      const deadBody = (await deadRes.json()) as {
        ok: boolean;
        data?: { items: DeadlineItem[] };
        error?: { message: string };
      };
      if (!deadRes.ok || !deadBody.ok) {
        setError(deadBody.error?.message ?? "Could not load deadlines.");
        setItems([]);
      } else {
        setItems(deadBody.data?.items ?? []);
      }

      if (tmplRes.ok) {
        const tmplBody = (await tmplRes.json()) as {
          ok?: boolean;
          data?: { items?: TemplateOption[] };
        };
        const list = tmplBody.data?.items ?? [];
        setTemplates(list);
        setTemplateId((prev) => prev || list[0]?.id || "");
      }
    } catch {
      setError("Could not load deadlines.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [matterId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedTemplate = templates.find((t) => t.id === templateId) ?? null;
  const duePreview = selectedTemplate
    ? previewDue(triggerDate, selectedTemplate.offsetDays)
    : null;

  const visible = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((i) => i.status === "open");
  }, [items, filter]);

  async function applyTemplate(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/matters/${matterId}/deadlines`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId,
          triggerDate,
          createCalendarEvent: createCalendar,
          notes: notes || null,
        }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setFormError(body.error?.message ?? "Could not apply template.");
        return;
      }
      setShowApply(false);
      setNotes("");
      await load();
    } catch {
      setFormError("Could not apply template.");
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(id: string, status: "open" | "done" | "cancelled") {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/deadlines/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not update deadline.");
        return;
      }
      await load();
    } catch {
      setError("Could not update deadline.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this deadline? Linked calendar event will also be removed.")) {
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/deadlines/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const body = (await res.json()) as {
        ok: boolean;
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not delete deadline.");
        return;
      }
      await load();
    } catch {
      setError("Could not delete deadline.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="toolbar" style={{ marginBottom: "0.75rem" }}>
        <select
          className="filter-select"
          value={filter}
          onChange={(e) => setFilter(e.target.value as "open" | "all")}
          aria-label="Filter deadlines"
        >
          <option value="open">Open</option>
          <option value="all">All</option>
        </select>
        <span className="toolbar-spacer" />
        <Can permission="calendar.manage">
          <Button
            size="sm"
            onClick={() => {
              setShowApply(true);
              setFormError(null);
            }}
          >
            Apply template
          </Button>
        </Can>
        <Button size="sm" variant="outline" onClick={() => load()} disabled={loading}>
          Refresh
        </Button>
      </div>

      <p className="muted" style={{ fontSize: "0.78rem", marginTop: 0 }}>
        Deadlines are an operational helper (calendar-day offsets). Not legal advice.{" "}
        <Link href="/settings">Manage templates in Settings</Link>.
      </p>

      {error ? (
        <p role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem" }}>
          {error}
        </p>
      ) : null}

      {showApply ? (
        <form
          onSubmit={applyTemplate}
          className="panel"
          style={{ padding: "1rem", marginBottom: "1rem" }}
        >
          <h4 style={{ marginTop: 0 }}>Apply deadline template</h4>
          {formError ? (
            <p role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem" }}>
              {formError}
            </p>
          ) : null}
          {!templates.length ? (
            <p className="muted" style={{ fontSize: "0.85rem" }}>
              No active templates. Create one under Settings → Deadline templates.
            </p>
          ) : (
            <>
              <div className="form-group">
                <label htmlFor="dl-template">Template</label>
                <select
                  id="dl-template"
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  required
                >
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.offsetDays >= 0 ? `+${t.offsetDays}` : t.offsetDays} days)
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="dl-trigger">Trigger date</label>
                <input
                  id="dl-trigger"
                  type="date"
                  value={triggerDate}
                  onChange={(e) => setTriggerDate(e.target.value)}
                  required
                />
              </div>
              {duePreview ? (
                <p style={{ fontSize: "0.85rem" }}>
                  <strong>Computed due:</strong> {duePreview}
                </p>
              ) : null}
              <div className="form-group">
                <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={createCalendar}
                    onChange={(e) => setCreateCalendar(e.target.checked)}
                  />
                  Add calendar filing/deadline event
                </label>
              </div>
              <div className="form-group">
                <label htmlFor="dl-notes">Notes</label>
                <textarea
                  id="dl-notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </>
          )}
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Button
              type="submit"
              size="sm"
              disabled={saving || !templates.length || !templateId}
            >
              {saving ? "Applying…" : "Apply"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={saving}
              onClick={() => setShowApply(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {loading && !items.length ? (
        <p className="muted" style={{ fontSize: "0.85rem" }}>
          Loading deadlines…
        </p>
      ) : null}

      {!loading && visible.length === 0 ? (
        <EmptyState
          title="No deadlines"
          detail="Apply a template with a trigger date to compute due dates."
        />
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th>Title</th>
              <th>Due</th>
              <th>Status</th>
              <th>Calendar</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.map((d) => (
              <tr
                key={d.id}
                style={
                  d.isOverdue
                    ? { background: "rgba(168, 83, 69, 0.08)" }
                    : undefined
                }
              >
                <td>
                  <div>{d.title}</div>
                  {d.notes ? (
                    <div className="muted" style={{ fontSize: "0.75rem" }}>
                      {d.notes}
                    </div>
                  ) : null}
                </td>
                <td
                  style={
                    d.isOverdue
                      ? { color: "var(--danger)", fontWeight: 600 }
                      : undefined
                  }
                >
                  {new Date(d.dueAt).toLocaleDateString(undefined, {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                  {d.isOverdue ? (
                    <div style={{ marginTop: "0.25rem" }}>
                      <Badge tone="danger">Overdue</Badge>
                    </div>
                  ) : null}
                </td>
                <td>
                  <Badge
                    tone={
                      d.status === "done"
                        ? "open"
                        : d.status === "cancelled"
                          ? "closed"
                          : "pending"
                    }
                  >
                    {d.status}
                  </Badge>
                </td>
                <td>
                  {d.calendarEventId ? (
                    <Link href="/calendar">On calendar</Link>
                  ) : (
                    <span className="muted">None</span>
                  )}
                </td>
                <td>
                  <Can permission="calendar.manage">
                    <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                      {d.status === "open" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={saving}
                          onClick={() => setStatus(d.id, "done")}
                        >
                          Done
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={saving}
                          onClick={() => setStatus(d.id, "open")}
                        >
                          Reopen
                        </Button>
                      )}
                      {d.status === "open" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={saving}
                          onClick={() => setStatus(d.id, "cancelled")}
                        >
                          Cancel
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={saving}
                        onClick={() => remove(d.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </Can>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
