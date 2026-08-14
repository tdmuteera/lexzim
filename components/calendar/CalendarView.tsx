"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Can } from "@/components/auth/Can";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import type { CalendarEventType } from "@/lib/db/ops-types";
import { CALENDAR_EVENT_TYPES } from "@/lib/calendar/validation";

type SerializedEvent = {
  id: string;
  matterId: string | null;
  matterNumber: string | null;
  matterTitle: string | null;
  eventType: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
};

type MatterOption = {
  id: string;
  matterNumber: string | null;
  title: string;
};

type ListResponse = {
  ok: boolean;
  data?: { items: SerializedEvent[] };
  error?: { message: string };
};

type EventResponse = {
  ok: boolean;
  data?: { event: SerializedEvent };
  error?: { message: string };
};

type ViewMode = "month" | "agenda";

type FormState = {
  eventType: CalendarEventType;
  title: string;
  description: string;
  location: string;
  matterId: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const EVENT_TYPE_LABELS: Record<CalendarEventType, string> = {
  hearing: "Hearing",
  appointment: "Appointment",
  filing: "Filing",
  deadline: "Deadline",
  other: "Other",
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toLocalInputValue(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

function addMonths(d: Date, delta: number) {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}

function emptyForm(defaults?: Partial<FormState>): FormState {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  now.setHours(now.getHours() + 1);
  const end = new Date(now);
  end.setHours(end.getHours() + 1);
  return {
    eventType: "appointment",
    title: "",
    description: "",
    location: "",
    matterId: "",
    startsAt: toLocalInputValue(now),
    endsAt: toLocalInputValue(end),
    allDay: false,
    ...defaults,
  };
}

function formFromEvent(ev: SerializedEvent): FormState {
  return {
    eventType: (CALENDAR_EVENT_TYPES.includes(ev.eventType as CalendarEventType)
      ? ev.eventType
      : "other") as CalendarEventType,
    title: ev.title,
    description: ev.description ?? "",
    location: ev.location ?? "",
    matterId: ev.matterId ?? "",
    startsAt: toLocalInputValue(ev.startsAt),
    endsAt: ev.endsAt ? toLocalInputValue(ev.endsAt) : "",
    allDay: ev.allDay,
  };
}

function formatWhen(ev: SerializedEvent): string {
  const start = new Date(ev.startsAt);
  if (ev.allDay) {
    return start.toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }
  const startLabel = start.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  if (!ev.endsAt) return startLabel;
  const end = new Date(ev.endsAt);
  return `${startLabel} to ${end.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
}

function eventCssClass(eventType: string): string {
  if (eventType === "hearing") return "hearing";
  if (eventType === "deadline" || eventType === "filing") return "deadline";
  if (eventType === "appointment") return "appointment";
  return "appointment";
}

export function CalendarView() {
  const { can } = useAuth();
  const canManage = can("calendar.manage");
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [items, setItems] = useState<SerializedEvent[]>([]);
  const [matters, setMatters] = useState<MatterOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState("");
  const [matterFilter, setMatterFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const range = useMemo(() => {
    if (viewMode === "agenda") {
      const from = new Date();
      from.setHours(0, 0, 0, 0);
      const to = new Date(from);
      to.setDate(to.getDate() + 60);
      to.setHours(23, 59, 59, 999);
      return { from, to };
    }
    const from = startOfMonth(cursor);
    const gridStart = new Date(from);
    gridStart.setDate(gridStart.getDate() - gridStart.getDay());
    gridStart.setHours(0, 0, 0, 0);
    const to = endOfMonth(cursor);
    const gridEnd = new Date(to);
    gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()));
    gridEnd.setHours(23, 59, 59, 999);
    return { from: gridStart, to: gridEnd };
  }, [cursor, viewMode]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("from", range.from.toISOString());
      params.set("to", range.to.toISOString());
      if (typeFilter) params.set("eventType", typeFilter);
      if (matterFilter) params.set("matterId", matterFilter);

      const res = await fetch(`/api/calendar?${params.toString()}`, {
        credentials: "include",
      });
      const body = (await res.json()) as ListResponse;
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not load calendar.");
        setItems([]);
        return;
      }
      setItems(body.data?.items ?? []);
    } catch {
      setError("Could not load calendar. Check your connection.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [range, typeFilter, matterFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      load();
    }, 150);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/matters?bucket=all", { credentials: "include" });
        const body = (await res.json()) as {
          ok: boolean;
          data?: { items: MatterOption[] };
        };
        if (!cancelled && res.ok && body.ok) {
          setMatters(body.data?.items ?? []);
        }
      } catch {
        /* matter picker optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const byDay = useMemo(() => {
    const map = new Map<string, SerializedEvent[]>();
    for (const ev of items) {
      const key = toDateKey(new Date(ev.startsAt));
      const list = map.get(key) ?? [];
      list.push(ev);
      map.set(key, list);
    }
    return map;
  }, [items]);

  const monthCells = useMemo(() => {
    const first = startOfMonth(cursor);
    const start = new Date(first);
    start.setDate(start.getDate() - start.getDay());
    const cells: { date: Date; inMonth: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      cells.push({
        date: d,
        inMonth: d.getMonth() === cursor.getMonth(),
      });
    }
    return cells;
  }, [cursor]);

  const selected = items.find((e) => e.id === selectedId) ?? null;

  function openCreate(day?: Date) {
    if (!canManage) return;
    const defaults: Partial<FormState> = {};
    if (day) {
      const start = new Date(day);
      start.setHours(9, 0, 0, 0);
      const end = new Date(start);
      end.setHours(10, 0, 0, 0);
      defaults.startsAt = toLocalInputValue(start);
      defaults.endsAt = toLocalInputValue(end);
    }
    if (matterFilter) defaults.matterId = matterFilter;
    if (typeFilter && CALENDAR_EVENT_TYPES.includes(typeFilter as CalendarEventType)) {
      defaults.eventType = typeFilter as CalendarEventType;
    }
    setEditingId(null);
    setForm(emptyForm(defaults));
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(ev: SerializedEvent) {
    if (ev.id.startsWith("matter-hearing:") && ev.matterId) {
      window.location.href = `/matters/${ev.matterId}`;
      return;
    }
    if (!canManage) {
      setSelectedId(ev.id);
      return;
    }
    setEditingId(ev.id);
    setForm(formFromEvent(ev));
    setFormError(null);
    setFormOpen(true);
    setSelectedId(ev.id);
  }

  async function saveEvent() {
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        eventType: form.eventType,
        title: form.title,
        description: form.description || null,
        location: form.location || null,
        matterId: form.matterId || null,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
        allDay: form.allDay,
      };
      const url = editingId ? `/api/calendar/${editingId}` : "/api/calendar";
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as EventResponse;
      if (!res.ok || !body.ok) {
        setFormError(body.error?.message ?? "Could not save event.");
        return;
      }
      setFormOpen(false);
      setEditingId(null);
      if (body.data?.event) setSelectedId(body.data.event.id);
      await load();
    } catch {
      setFormError("Could not save event. Check your connection.");
    } finally {
      setSaving(false);
    }
  }

  async function removeEvent(id: string) {
    if (!window.confirm("Delete this calendar event?")) return;
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/calendar/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const body = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setFormError(body.error?.message ?? "Could not delete event.");
        return;
      }
      setFormOpen(false);
      setEditingId(null);
      setSelectedId(null);
      await load();
    } catch {
      setFormError("Could not delete event. Check your connection.");
    } finally {
      setSaving(false);
    }
  }

  const monthLabel = cursor.toLocaleString(undefined, { month: "long", year: "numeric" });
  const todayKey = toDateKey(new Date());

  return (
    <section className="view active scrollable" aria-label="Court Calendar">
      <div className="panel">
        <div className="panel-head">
          <h3>Court Calendar</h3>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <Can permission="calendar.manage">
              <Button size="sm" onClick={() => openCreate()}>
                New event
              </Button>
            </Can>
          </div>
        </div>
        <div className="panel-body">
          <p className="muted" style={{ marginTop: 0, marginBottom: "0.75rem", fontSize: "0.8rem" }}>
            Firm diary for hearings, appointments, and filing deadlines. Google and Outlook sync
            coming later.
          </p>

          <div className="toolbar">
            <div style={{ display: "flex", gap: "0.35rem" }}>
              <Button
                size="sm"
                variant={viewMode === "month" ? "primary" : "outline"}
                onClick={() => setViewMode("month")}
              >
                Month
              </Button>
              <Button
                size="sm"
                variant={viewMode === "agenda" ? "primary" : "outline"}
                onClick={() => setViewMode("agenda")}
              >
                Agenda
              </Button>
            </div>

            {viewMode === "month" ? (
              <>
                <Button size="sm" variant="outline" onClick={() => setCursor(addMonths(cursor, -1))}>
                  Prev
                </Button>
                <strong style={{ fontSize: "0.85rem", minWidth: "9rem", textAlign: "center" }}>
                  {monthLabel}
                </strong>
                <Button size="sm" variant="outline" onClick={() => setCursor(addMonths(cursor, 1))}>
                  Next
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setCursor(startOfMonth(new Date()))}
                >
                  Today
                </Button>
              </>
            ) : (
              <span style={{ fontSize: "0.8rem", color: "var(--text-3)" }}>
                Next 60 days from today
              </span>
            )}

            <span className="toolbar-spacer" />

            <select
              className="filter-select"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              aria-label="Filter by event type"
            >
              <option value="">All types</option>
              {CALENDAR_EVENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {EVENT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>

            <select
              className="filter-select"
              value={matterFilter}
              onChange={(e) => setMatterFilter(e.target.value)}
              aria-label="Filter by matter"
              style={{ minWidth: "180px" }}
            >
              <option value="">All matters</option>
              {matters.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.matterNumber ? `${m.matterNumber} · ${m.title}` : m.title}
                </option>
              ))}
            </select>

            <Button size="sm" variant="outline" onClick={() => load()} disabled={loading}>
              Refresh
            </Button>
          </div>

          {error ? (
            <p role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem" }}>
              {error}
            </p>
          ) : null}

          {loading && !items.length ? (
            <p className="muted" style={{ fontSize: "0.85rem" }}>
              Loading calendar…
            </p>
          ) : null}

          {viewMode === "month" ? (
            <div className="cal-grid" style={{ marginTop: "0.75rem" }}>
              {WEEKDAYS.map((d) => (
                <div key={d} className="cal-head">
                  {d}
                </div>
              ))}
              {monthCells.map(({ date, inMonth }) => {
                const key = toDateKey(date);
                const dayEvents = byDay.get(key) ?? [];
                const isToday = key === todayKey;
                return (
                  <div
                    key={key}
                    className={`cal-day${inMonth ? "" : " muted"}${isToday ? " today" : ""}`}
                    onDoubleClick={() => openCreate(date)}
                  >
                    <div className="cal-day-num">{date.getDate()}</div>
                    {dayEvents.slice(0, 3).map((ev) => (
                      <div
                        key={ev.id}
                        className={`cal-event ${eventCssClass(ev.eventType)}`}
                        title={ev.title}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedId(ev.id);
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          openEdit(ev);
                        }}
                      >
                        {ev.title}
                      </div>
                    ))}
                    {dayEvents.length > 3 ? (
                      <div style={{ fontSize: "0.6rem", color: "var(--text-3)" }}>
                        +{dayEvents.length - 3} more
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ marginTop: "0.75rem" }}>
              {!loading && items.length === 0 ? (
                <EmptyState
                  title="No upcoming events"
                  detail="Create a hearing, appointment, or filing deadline."
                />
              ) : (
                <table className="data">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Type</th>
                      <th>Title</th>
                      <th>Matter</th>
                      <th>Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((ev) => (
                      <tr
                        key={ev.id}
                        onClick={() => setSelectedId(ev.id)}
                        style={{
                          cursor: "pointer",
                          background:
                            selectedId === ev.id ? "var(--gold-dim)" : undefined,
                        }}
                      >
                        <td>{formatWhen(ev)}</td>
                        <td>
                          <span className={`badge badge-${eventCssClass(ev.eventType)}`}>
                            {EVENT_TYPE_LABELS[ev.eventType as CalendarEventType] ??
                              ev.eventType}
                          </span>
                        </td>
                        <td>{ev.title}</td>
                        <td>
                          {ev.matterId ? (
                            <Link href={`/matters/${ev.matterId}`}>
                              {ev.matterNumber
                                ? `${ev.matterNumber} · ${ev.matterTitle ?? ""}`
                                : (ev.matterTitle ?? "Matter")}
                            </Link>
                          ) : (
                            <span className="muted">None</span>
                          )}
                        </td>
                        <td>{ev.location ?? "None"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {selected && !formOpen ? (
            <div className="panel" style={{ marginTop: "1rem" }}>
              <div className="panel-head">
                <h3>{selected.title}</h3>
                <Can permission="calendar.manage">
                  <div style={{ display: "flex", gap: "0.35rem" }}>
                    <Button size="sm" variant="outline" onClick={() => openEdit(selected)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => removeEvent(selected.id)}
                      disabled={saving}
                    >
                      Delete
                    </Button>
                  </div>
                </Can>
              </div>
              <div className="panel-body" style={{ fontSize: "0.85rem" }}>
                <p>
                  <strong>Type:</strong>{" "}
                  {EVENT_TYPE_LABELS[selected.eventType as CalendarEventType] ??
                    selected.eventType}
                </p>
                <p>
                  <strong>When:</strong> {formatWhen(selected)}
                  {selected.allDay ? " (all day)" : ""}
                </p>
                {selected.location ? (
                  <p>
                    <strong>Location:</strong> {selected.location}
                  </p>
                ) : null}
                {selected.description ? (
                  <p>
                    <strong>Notes:</strong> {selected.description}
                  </p>
                ) : null}
                {selected.matterId ? (
                  <p>
                    <strong>Matter:</strong>{" "}
                    <Link href={`/matters/${selected.matterId}`}>
                      {selected.matterNumber
                        ? `${selected.matterNumber} · ${selected.matterTitle ?? ""}`
                        : (selected.matterTitle ?? "Open matter")}
                    </Link>
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {formOpen ? (
            <div className="panel" style={{ marginTop: "1rem" }}>
              <div className="panel-head">
                <h3>{editingId ? "Edit event" : "New event"}</h3>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setFormOpen(false);
                    setEditingId(null);
                    setFormError(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
              <div className="panel-body">
                {formError ? (
                  <p role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem" }}>
                    {formError}
                  </p>
                ) : null}
                <div className="form-group">
                  <label htmlFor="cal-title">Title</label>
                  <input
                    id="cal-title"
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    required
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  <div className="form-group">
                    <label htmlFor="cal-type">Type</label>
                    <select
                      id="cal-type"
                      value={form.eventType}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          eventType: e.target.value as CalendarEventType,
                        }))
                      }
                    >
                      {CALENDAR_EVENT_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {EVENT_TYPE_LABELS[t]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="cal-matter">Matter (optional)</label>
                    <select
                      id="cal-matter"
                      value={form.matterId}
                      onChange={(e) => setForm((f) => ({ ...f, matterId: e.target.value }))}
                    >
                      <option value="">No matter</option>
                      {matters.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.matterNumber ? `${m.matterNumber} · ${m.title}` : m.title}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  <div className="form-group">
                    <label htmlFor="cal-start">Starts</label>
                    <input
                      id="cal-start"
                      type="datetime-local"
                      value={form.startsAt}
                      onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="cal-end">Ends</label>
                    <input
                      id="cal-end"
                      type="datetime-local"
                      value={form.endsAt}
                      onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))}
                      disabled={form.allDay}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={form.allDay}
                      onChange={(e) => setForm((f) => ({ ...f, allDay: e.target.checked }))}
                    />
                    All day
                  </label>
                </div>
                <div className="form-group">
                  <label htmlFor="cal-location">Location</label>
                  <input
                    id="cal-location"
                    value={form.location}
                    onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                    placeholder="Court, chambers, Zoom…"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="cal-desc">Notes</label>
                  <textarea
                    id="cal-desc"
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    rows={3}
                  />
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <Button onClick={saveEvent} disabled={saving || !form.title.trim()}>
                    {saving ? "Saving…" : editingId ? "Save changes" : "Create event"}
                  </Button>
                  {editingId ? (
                    <Button
                      variant="danger"
                      disabled={saving}
                      onClick={() => removeEvent(editingId)}
                    >
                      Delete
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
