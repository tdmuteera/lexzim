"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Can } from "@/components/auth/Can";
import { useAuth } from "@/components/auth/AuthProvider";
import { ClientSearchPicker } from "@/components/finance/ClientSearchPicker";
import { CalendarSharePeoplePicker } from "@/components/calendar/CalendarSharePeoplePicker";
import { MyDayCalendarStrip } from "@/components/my-day/MyDayCalendarStrip";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { SortableTh } from "@/components/ui/SortableTh";
import type { CalendarEventType } from "@/lib/db/ops-types";
import {
  CALENDAR_EVENT_TYPES,
  CALENDAR_RECURRENCE_RULES,
  CALENDAR_VISIBILITIES,
  DEFAULT_CALENDAR_COLOR,
  type CalendarRecurrenceRule,
  type CalendarVisibility,
} from "@/lib/calendar/validation";
import { useTableSort } from "@/lib/ui/table-sort";

type GuestDraft = {
  email: string;
  displayName: string;
  source: "client" | "external";
  notify: boolean;
};

type SerializedEvent = {
  id: string;
  matterId: string | null;
  clientId: string | null;
  clientDisplayName: string | null;
  matterNumber: string | null;
  matterTitle: string | null;
  eventType: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  visibility?: string;
  sharedUserIds?: string[];
  guests?: GuestDraft[];
  notifyClient?: boolean;
  recurrenceRule?: string | null;
  recurrenceUntil?: string | null;
  postponedFrom?: string | null;
  creatorCalendarColor?: string | null;
  creatorFullName?: string | null;
  canEdit?: boolean;
  isPublicHoliday?: boolean;
  createdBy?: string | null;
};

type MatterOption = {
  id: string;
  matterNumber: string | null;
  title: string;
  clientId: string;
};

type AssigneeOption = {
  id: string;
  fullName: string;
  email?: string;
};

type ListResponse = {
  ok: boolean;
  data?: { items: SerializedEvent[]; myCalendarColor?: string | null };
  error?: { message: string };
};

type EventResponse = {
  ok: boolean;
  data?: { event: SerializedEvent };
  error?: { message: string };
};

type ViewMode = "month" | "agenda";
type CategoryFilter = "all" | "meetings" | "hearings";

type FormState = {
  eventType: CalendarEventType;
  title: string;
  description: string;
  location: string;
  matterId: string;
  clientId: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  visibility: CalendarVisibility;
  sharedUserIds: string[];
  notifyClient: boolean;
  clientEmail: string;
  guestEmailsText: string;
  recurrenceRule: "" | CalendarRecurrenceRule;
  recurrenceUntil: string;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const EVENT_TYPE_LABELS: Record<string, string> = {
  hearing: "Hearing",
  appointment: "Appointment",
  filing: "Filing",
  deadline: "Deadline",
  other: "Other",
  holiday: "Public holiday",
};

const VISIBILITY_LABELS: Record<CalendarVisibility, string> = {
  private: "Private",
  firm: "Firm",
  people: "Specific people",
};

const RECURRENCE_LABELS: Record<CalendarRecurrenceRule, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
};

const DEFAULT_MY_COLOUR = DEFAULT_CALENDAR_COLOR;

function guestsToText(guests: GuestDraft[] | undefined): string {
  if (!guests?.length) return "";
  return guests
    .filter((g) => g.source !== "client")
    .map((g) => g.email)
    .join(", ");
}

function parseGuestEmailsText(text: string): GuestDraft[] {
  const parts = text
    .split(/[,;\n]+/)
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  const out: GuestDraft[] = [];
  for (const email of parts) {
    if (!email.includes("@")) continue;
    if (out.some((g) => g.email === email)) continue;
    out.push({ email, displayName: "", source: "external", notify: true });
  }
  return out;
}

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
    clientId: "",
    startsAt: toLocalInputValue(now),
    endsAt: toLocalInputValue(end),
    allDay: false,
    visibility: "private",
    sharedUserIds: [],
    notifyClient: false,
    clientEmail: "",
    guestEmailsText: "",
    recurrenceRule: "",
    recurrenceUntil: "",
    ...defaults,
  };
}

function formFromEvent(ev: SerializedEvent): FormState {
  const visibility = (CALENDAR_VISIBILITIES as readonly string[]).includes(ev.visibility ?? "")
    ? (ev.visibility as CalendarVisibility)
    : "private";
  const recurrenceRule =
    ev.recurrenceRule === "weekly" || ev.recurrenceRule === "monthly"
      ? ev.recurrenceRule
      : "";
  const clientGuest = (ev.guests ?? []).find((g) => g.source === "client");
  return {
    eventType: (CALENDAR_EVENT_TYPES.includes(ev.eventType as CalendarEventType)
      ? ev.eventType
      : "other") as CalendarEventType,
    title: ev.title,
    description: ev.description ?? "",
    location: ev.location ?? "",
    matterId: ev.matterId ?? "",
    clientId: ev.clientId ?? "",
    startsAt: toLocalInputValue(ev.startsAt),
    endsAt: ev.endsAt ? toLocalInputValue(ev.endsAt) : "",
    allDay: ev.allDay,
    visibility,
    sharedUserIds: ev.sharedUserIds ?? [],
    notifyClient: Boolean(ev.notifyClient),
    clientEmail: clientGuest?.email ?? "",
    guestEmailsText: guestsToText(ev.guests),
    recurrenceRule,
    recurrenceUntil: ev.recurrenceUntil ? toLocalInputValue(ev.recurrenceUntil).slice(0, 10) : "",
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

function eventColourStyle(
  ev: SerializedEvent,
  myColor: string,
  userId?: string,
): { backgroundColor: string; borderColor: string; color: string } {
  // Colour follows the creator so shared / firm events stay distinct on one calendar.
  const colour = (
    ev.creatorCalendarColor?.trim() ||
    (userId && ev.createdBy === userId ? myColor.trim() : DEFAULT_CALENDAR_COLOR)
  ).trim();
  return {
    backgroundColor: colour,
    borderColor: colour,
    color: "#fff",
  };
}

function eventColourClass() {
  return "coloured";
}

export function CalendarView() {
  const { can, user } = useAuth();
  const canManage = can("calendar.manage");
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [items, setItems] = useState<SerializedEvent[]>([]);
  const [matters, setMatters] = useState<MatterOption[]>([]);
  const [assignees, setAssignees] = useState<AssigneeOption[]>([]);
  const [myCalendarColor, setMyCalendarColor] = useState(DEFAULT_MY_COLOUR);
  const [pendingCalendarColor, setPendingCalendarColor] = useState(DEFAULT_MY_COLOUR);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [matterFilter, setMatterFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [colourSaving, setColourSaving] = useState(false);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [postponeOpen, setPostponeOpen] = useState(false);
  const [postponeStartsAt, setPostponeStartsAt] = useState("");
  const [postponeEndsAt, setPostponeEndsAt] = useState("");
  const [postponeAllDay, setPostponeAllDay] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

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
      params.set("scope", "all");
      if (categoryFilter === "meetings") params.set("eventType", "appointment");
      if (categoryFilter === "hearings") params.set("eventType", "hearing");
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
      const loaded = body.data?.myCalendarColor ?? DEFAULT_MY_COLOUR;
      setMyCalendarColor(loaded);
      setPendingCalendarColor(loaded);
    } catch {
      setError("Could not load calendar. Check your connection.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [range, categoryFilter, matterFilter]);

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/workflow/assignees", { credentials: "include" });
        const body = (await res.json()) as {
          ok: boolean;
          data?: { items: AssigneeOption[] };
        };
        if (!cancelled && res.ok && body.ok) {
          setAssignees(body.data?.items ?? []);
        }
      } catch {
        /* assignees optional for share picker */
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
  const formValid = Boolean(form.title.trim() && form.location.trim());
  const agendaAccessors = useMemo(
    () => ({
      when: (ev: SerializedEvent) => ev.startsAt,
      type: (ev: SerializedEvent) => ev.eventType,
      title: (ev: SerializedEvent) => ev.title,
      visibility: (ev: SerializedEvent) => ev.visibility ?? "private",
      matter: (ev: SerializedEvent) => ev.matterNumber || ev.matterTitle,
      location: (ev: SerializedEvent) => ev.location,
    }),
    [],
  );
  const {
    sortedRows: sortedAgenda,
    sortKey: agendaSortKey,
    sortDir: agendaSortDir,
    toggleSort: toggleAgendaSort,
  } = useTableSort(items, agendaAccessors, { key: "when", dir: "asc" });
  const shareCandidates = useMemo(
    () => assignees.filter((a) => a.id !== user?.id),
    [assignees, user?.id],
  );

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setFormError(null);
    setShowMoreOptions(false);
    setPostponeOpen(false);
  }

  function openCreate(opts?: { day?: Date; eventType?: CalendarEventType }) {
    if (!canManage) return;
    const defaults: Partial<FormState> = { visibility: "private", sharedUserIds: [] };
    if (opts?.day) {
      const start = new Date(opts.day);
      start.setHours(8, 0, 0, 0);
      const end = new Date(start);
      end.setHours(9, 0, 0, 0);
      defaults.startsAt = toLocalInputValue(start);
      defaults.endsAt = toLocalInputValue(end);
    }
    if (matterFilter) defaults.matterId = matterFilter;
    if (opts?.eventType) {
      defaults.eventType = opts.eventType;
    } else if (categoryFilter === "meetings") {
      defaults.eventType = "appointment";
    } else if (categoryFilter === "hearings") {
      defaults.eventType = "hearing";
    } else {
      defaults.eventType = "other";
    }
    setEditingId(null);
    setForm(emptyForm(defaults));
    setFormError(null);
    setShowMoreOptions(false);
    setFormOpen(true);
  }

  function openCreateMeeting(day?: Date) {
    openCreate({ day, eventType: "appointment" });
  }

  useEffect(() => {
    if (!formOpen) return;
    const t = window.setTimeout(() => titleInputRef.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [formOpen]);

  const filteredMatters = useMemo(() => {
    if (!form.clientId) return matters;
    return matters.filter((m) => m.clientId === form.clientId);
  }, [matters, form.clientId]);

  function openEdit(ev: SerializedEvent) {
    if (ev.id.startsWith("matter-hearing:") && ev.matterId) {
      window.location.href = `/matters/${ev.matterId}`;
      return;
    }
    if (ev.isPublicHoliday || ev.id.startsWith("holiday:")) {
      setSelectedId(ev.id);
      return;
    }
    if (!canManage || ev.canEdit === false) {
      setSelectedId(ev.id);
      return;
    }
    setEditingId(ev.id);
    setForm(formFromEvent(ev));
    setFormError(null);
    setShowMoreOptions(
      Boolean(ev.notifyClient || (ev.guests && ev.guests.length) || ev.recurrenceRule),
    );
    setFormOpen(true);
    setSelectedId(ev.id);
    void (async () => {
      try {
        const res = await fetch(`/api/calendar/${ev.id}`, { credentials: "include" });
        const body = (await res.json()) as EventResponse;
        if (res.ok && body.ok && body.data?.event) {
          const full = body.data.event;
          setForm(formFromEvent(full));
          setShowMoreOptions(
            Boolean(
              full.notifyClient || (full.guests && full.guests.length) || full.recurrenceRule,
            ),
          );
        }
      } catch {
        /* keep list snapshot */
      }
    })();
  }

  useEffect(() => {
    if (!formOpen || !form.clientId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/clients/${form.clientId}`, {
          credentials: "include",
        });
        const body = (await res.json()) as {
          ok?: boolean;
          data?: { client?: { email?: string | null } };
        };
        if (cancelled || !body.ok) return;
        const email = body.data?.client?.email?.trim() ?? "";
        setForm((f) => {
          if (f.clientId !== form.clientId) return f;
          return { ...f, clientEmail: email };
        });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.clientId, formOpen]);

  async function saveEvent() {
    if (!formValid) {
      setFormError("Title and location are required.");
      return;
    }
    if (form.visibility === "people" && form.sharedUserIds.length === 0) {
      setFormError("Select at least one person for Specific people visibility.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const guests = parseGuestEmailsText(form.guestEmailsText);
      const payload = {
        eventType: form.eventType,
        title: form.title,
        description: form.description || null,
        location: form.location,
        matterId: form.matterId || null,
        clientId: form.clientId || null,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
        allDay: form.allDay,
        visibility: form.visibility,
        sharedUserIds: form.visibility === "people" ? form.sharedUserIds : [],
        notifyClient: Boolean(form.notifyClient && form.clientId),
        guests,
        recurrenceRule: editingId ? undefined : form.recurrenceRule || null,
        recurrenceUntil:
          !editingId && form.recurrenceRule && form.recurrenceUntil
            ? new Date(`${form.recurrenceUntil}T23:59:59`).toISOString()
            : undefined,
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
      closeForm();
      if (body.data?.event) setSelectedId(body.data.event.id);
      await load();
    } catch {
      setFormError("Could not save event. Check your connection.");
    } finally {
      setSaving(false);
    }
  }

  function openPostpone() {
    if (!editingId) return;
    setPostponeStartsAt(form.startsAt);
    setPostponeEndsAt(form.endsAt);
    setPostponeAllDay(form.allDay);
    setPostponeOpen(true);
  }

  async function submitPostpone() {
    if (!editingId || !postponeStartsAt) {
      setFormError("Choose a new start time to postpone.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/calendar/${editingId}/postpone`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startsAt: new Date(postponeStartsAt).toISOString(),
          endsAt: postponeEndsAt ? new Date(postponeEndsAt).toISOString() : null,
          allDay: postponeAllDay,
        }),
      });
      const body = (await res.json()) as EventResponse;
      if (!res.ok || !body.ok) {
        setFormError(body.error?.message ?? "Could not postpone event.");
        return;
      }
      closeForm();
      if (body.data?.event) setSelectedId(body.data.event.id);
      await load();
    } catch {
      setFormError("Could not postpone event. Check your connection.");
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

  async function saveMyColour(next: string) {
    setMyCalendarColor(next);
    setColourSaving(true);
    try {
      const res = await fetch("/api/calendar/color", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendarColor: next }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { myCalendarColor?: string | null };
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not save calendar colour.");
        return;
      }
      if (body.data?.myCalendarColor) {
        setMyCalendarColor(body.data.myCalendarColor);
        setPendingCalendarColor(body.data.myCalendarColor);
      }
      await load();
    } catch {
      setError("Could not save calendar colour.");
    } finally {
      setColourSaving(false);
    }
  }

  function setSharedUserIds(ids: string[]) {
    setForm((f) => ({
      ...f,
      sharedUserIds: ids,
      // Picking people implies Specific people visibility so shares actually persist.
      visibility: ids.length > 0 ? "people" : f.visibility === "people" ? "private" : f.visibility,
    }));
  }

  const colourDirty = pendingCalendarColor !== myCalendarColor;

  const monthLabel = cursor.toLocaleString(undefined, { month: "long", year: "numeric" });
  const todayKey = toDateKey(new Date());
  const formTitle = editingId
    ? form.eventType === "appointment"
      ? "Edit meeting"
      : "Edit event"
    : form.eventType === "appointment"
      ? "New meeting"
      : "New event";

  const canEditSelected = selected
    ? selected.canEdit !== false &&
      canManage &&
      !selected.id.startsWith("matter-hearing:") &&
      !selected.isPublicHoliday &&
      !selected.id.startsWith("holiday:")
    : false;

  return (
    <section className="view active scrollable" aria-label="Court Calendar">
      <div className="panel">
        <div className="panel-head">
          <h3>Court Calendar</h3>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <Can permission="calendar.manage">
              <Button size="sm" variant="outline" onClick={() => openCreateMeeting()}>
                New meeting
              </Button>
              <Button size="sm" onClick={() => openCreate()}>
                New event
              </Button>
            </Can>
          </div>
        </div>
        <div className="panel-body">
          <p className="muted" style={{ marginTop: 0, marginBottom: "0.75rem", fontSize: "0.8rem" }}>
            One calendar for everything you can see: your events, firm events, and events shared
            with you. Colour follows the person who created the event (set yours below). Private
            events stay private to their creator. Click a day to create.
          </p>

          <MyDayCalendarStrip />

          <div
            className="toolbar"
            style={{ marginBottom: "0.5rem", alignItems: "center", flexWrap: "wrap" }}
          >
            <div className="cal-colour-picker">
              <label className="cal-colour-picker-label" htmlFor="cal-my-colour">
                My colour
              </label>
              <input
                id="cal-my-colour"
                type="color"
                className="cal-colour-input"
                value={pendingCalendarColor}
                disabled={colourSaving}
                onChange={(e) => setPendingCalendarColor(e.target.value.toUpperCase())}
                aria-label="My calendar colour"
              />
              <span className="cal-colour-value muted">{pendingCalendarColor}</span>
              <Button
                size="sm"
                variant={colourDirty ? "primary" : "outline"}
                disabled={!colourDirty || colourSaving}
                onClick={() => void saveMyColour(pendingCalendarColor)}
              >
                {colourSaving ? "Saving…" : "Save colour"}
              </Button>
            </div>
          </div>

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

            <div style={{ display: "flex", gap: "0.35rem" }}>
              {(
                [
                  ["all", "All"],
                  ["meetings", "Meetings"],
                  ["hearings", "Hearings"],
                ] as const
              ).map(([key, label]) => (
                <Button
                  key={key}
                  size="sm"
                  variant={categoryFilter === key ? "primary" : "outline"}
                  onClick={() => setCategoryFilter(key)}
                >
                  {label}
                </Button>
              ))}
            </div>

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
                    onClick={() => openCreate({ day: date })}
                    onDoubleClick={() => openCreate({ day: date })}
                  >
                    <div className="cal-day-num">{date.getDate()}</div>
                    {dayEvents.slice(0, 3).map((ev) => (
                      <div
                        key={ev.id}
                        className={`cal-event ${eventColourClass()}`}
                        style={eventColourStyle(ev, myCalendarColor, user?.id)}
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
                      <SortableTh
                        label="When"
                        columnKey="when"
                        activeKey={agendaSortKey}
                        direction={agendaSortDir}
                        onSort={toggleAgendaSort}
                      />
                      <SortableTh
                        label="Type"
                        columnKey="type"
                        activeKey={agendaSortKey}
                        direction={agendaSortDir}
                        onSort={toggleAgendaSort}
                      />
                      <SortableTh
                        label="Title"
                        columnKey="title"
                        activeKey={agendaSortKey}
                        direction={agendaSortDir}
                        onSort={toggleAgendaSort}
                      />
                      <SortableTh
                        label="Visibility"
                        columnKey="visibility"
                        activeKey={agendaSortKey}
                        direction={agendaSortDir}
                        onSort={toggleAgendaSort}
                      />
                      <SortableTh
                        label="Matter"
                        columnKey="matter"
                        activeKey={agendaSortKey}
                        direction={agendaSortDir}
                        onSort={toggleAgendaSort}
                      />
                      <SortableTh
                        label="Location"
                        columnKey="location"
                        activeKey={agendaSortKey}
                        direction={agendaSortDir}
                        onSort={toggleAgendaSort}
                      />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedAgenda.map((ev) => (
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
                          <span
                            className={`badge badge-${eventCssClass(ev.eventType)}`}
                            style={eventColourStyle(ev, myCalendarColor, user?.id)}
                          >
                            {EVENT_TYPE_LABELS[ev.eventType as CalendarEventType] ??
                              ev.eventType}
                          </span>
                        </td>
                        <td>{ev.title}</td>
                        <td>
                          {VISIBILITY_LABELS[(ev.visibility as CalendarVisibility) ?? "private"] ??
                            ev.visibility ??
                            "Private"}
                        </td>
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
                {canEditSelected ? (
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
                ) : null}
              </div>
              <div className="panel-body" style={{ fontSize: "0.85rem" }}>
                <p>
                  <strong>Type:</strong>{" "}
                  {EVENT_TYPE_LABELS[selected.eventType as CalendarEventType] ??
                    selected.eventType}
                </p>
                <p>
                  <strong>Visibility:</strong>{" "}
                  <span className="badge">
                    {VISIBILITY_LABELS[(selected.visibility as CalendarVisibility) ?? "private"] ??
                      selected.visibility ??
                      "Private"}
                  </span>
                </p>
                <p>
                  <strong>Created by:</strong>{" "}
                  {selected.createdBy === user?.id
                    ? "You"
                    : selected.creatorFullName?.trim() || "Someone in the firm"}
                </p>
                <p>
                  <strong>When:</strong> {formatWhen(selected)}
                  {selected.allDay ? " (all day)" : ""}
                </p>
                {selected.postponedFrom ? (
                  <p>
                    <strong>Postponed from:</strong>{" "}
                    {formatWhen({
                      ...selected,
                      startsAt: selected.postponedFrom,
                      endsAt: null,
                    })}
                  </p>
                ) : null}
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
                {selected.clientId || selected.clientDisplayName ? (
                  <p>
                    <strong>Client:</strong>{" "}
                    {selected.clientId ? (
                      <Link href={`/clients/${selected.clientId}`}>
                        {selected.clientDisplayName ?? "Client"}
                      </Link>
                    ) : (
                      selected.clientDisplayName
                    )}
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
            <Modal open={formOpen} title={formTitle} onClose={closeForm}>
              {formError ? (
                <p role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem" }}>
                  {formError}
                </p>
              ) : null}
              <div className="form-group">
                <label htmlFor="cal-title">Title</label>
                <input
                  id="cal-title"
                  ref={titleInputRef}
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="cal-location">Location</label>
                <input
                  id="cal-location"
                  value={form.location}
                  onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                  placeholder="Court, chambers, Zoom…"
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
                  <label htmlFor="cal-visibility">Visibility</label>
                  <select
                    id="cal-visibility"
                    value={form.visibility}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        visibility: e.target.value as CalendarVisibility,
                        sharedUserIds:
                          e.target.value === "people" ? f.sharedUserIds : [],
                      }))
                    }
                  >
                    {CALENDAR_VISIBILITIES.map((v) => (
                      <option key={v} value={v}>
                        {VISIBILITY_LABELS[v]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {form.visibility === "people" ? (
                <div className="form-group">
                  <label htmlFor="cal-share-people-search">Share with</label>
                  <CalendarSharePeoplePicker
                    people={shareCandidates}
                    selectedIds={form.sharedUserIds}
                    onChange={setSharedUserIds}
                  />
                </div>
              ) : null}
              {form.eventType ? (
                <div className="form-group">
                  <ClientSearchPicker
                    value={form.clientId}
                    onChange={(id) =>
                      setForm((f) => ({
                        ...f,
                        clientId: id,
                        matterId:
                          f.matterId &&
                          matters.find((m) => m.id === f.matterId)?.clientId !== id
                            ? ""
                            : f.matterId,
                        notifyClient: id ? f.notifyClient : false,
                        clientEmail: id ? f.clientEmail : "",
                      }))
                    }
                    label="Client (optional)"
                    placeholder={
                      form.eventType === "hearing"
                        ? "Search client for this hearing…"
                        : form.eventType === "appointment"
                          ? "Search client for this meeting…"
                          : "Search client for this event…"
                    }
                  />
                  {form.clientId ? (
                    <div style={{ marginTop: "0.5rem", fontSize: "0.85rem" }}>
                      {form.clientEmail ? (
                        <>
                          <p style={{ margin: "0 0 0.35rem" }}>
                            Client email: <strong>{form.clientEmail}</strong>
                          </p>
                          <label
                            style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}
                          >
                            <input
                              type="checkbox"
                              checked={form.notifyClient}
                              onChange={(e) =>
                                setForm((f) => ({ ...f, notifyClient: e.target.checked }))
                              }
                            />
                            Also email this client the event notifications
                          </label>
                        </>
                      ) : (
                        <p style={{ margin: 0, color: "var(--muted, #667)" }}>
                          Client is in the system but has no email on file yet (not onboarded for
                          email). Add other recipients below if needed.
                        </p>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className="form-group">
                <label htmlFor="cal-matter">Matter (optional)</label>
                <select
                  id="cal-matter"
                  value={form.matterId}
                  onChange={(e) => {
                    const matterId = e.target.value;
                    const matter = matters.find((m) => m.id === matterId);
                    setForm((f) => ({
                      ...f,
                      matterId,
                      clientId: matter?.clientId ?? f.clientId,
                    }));
                  }}
                >
                  <option value="">No matter</option>
                  {filteredMatters.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.matterNumber ? `${m.matterNumber} · ${m.title}` : m.title}
                    </option>
                  ))}
                </select>
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
                <label htmlFor="cal-desc">Notes</label>
                <textarea
                  id="cal-desc"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                />
              </div>
              <div className="form-group">
                <button
                  type="button"
                  className="btn-link"
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    color: "var(--accent, #1b6f6d)",
                    cursor: "pointer",
                    fontSize: "0.9rem",
                  }}
                  onClick={() => setShowMoreOptions((v) => !v)}
                >
                  {showMoreOptions ? "Hide optional extras" : "Optional: guests, repeat…"}
                </button>
              </div>
              {showMoreOptions ? (
                <>
                  <div className="form-group">
                    <label htmlFor="cal-guests">Other recipients (optional)</label>
                    <textarea
                      id="cal-guests"
                      value={form.guestEmailsText}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, guestEmailsText: e.target.value }))
                      }
                      rows={2}
                      placeholder="External emails, comma-separated (other lawyers, parties…)"
                    />
                    <p style={{ margin: "0.35rem 0 0", fontSize: "0.8rem", color: "var(--muted, #667)" }}>
                      Non-staff recipients get a firm-branded notice (no LexZim branding), with who
                      created the event.
                    </p>
                  </div>
                  {!editingId ? (
                    <div
                      style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}
                    >
                      <div className="form-group">
                        <label htmlFor="cal-recur">Repeat (optional)</label>
                        <select
                          id="cal-recur"
                          value={form.recurrenceRule}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              recurrenceRule: e.target.value as FormState["recurrenceRule"],
                            }))
                          }
                        >
                          <option value="">Does not repeat</option>
                          {CALENDAR_RECURRENCE_RULES.map((r) => (
                            <option key={r} value={r}>
                              {RECURRENCE_LABELS[r]}
                            </option>
                          ))}
                        </select>
                      </div>
                      {form.recurrenceRule ? (
                        <div className="form-group">
                          <label htmlFor="cal-recur-until">Until (optional)</label>
                          <input
                            id="cal-recur-until"
                            type="date"
                            value={form.recurrenceUntil}
                            onChange={(e) =>
                              setForm((f) => ({ ...f, recurrenceUntil: e.target.value }))
                            }
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {editingId ? (
                    <div className="form-group">
                      {!postponeOpen ? (
                        <Button variant="ghost" disabled={saving} onClick={openPostpone}>
                          Postpone event…
                        </Button>
                      ) : (
                        <div
                          style={{
                            border: "1px solid var(--border, #d9e2ec)",
                            borderRadius: 8,
                            padding: "0.75rem",
                          }}
                        >
                          <p style={{ margin: "0 0 0.5rem", fontWeight: 600 }}>Postpone</p>
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr 1fr",
                              gap: "0.75rem",
                            }}
                          >
                            <div className="form-group">
                              <label htmlFor="cal-postpone-start">New start</label>
                              <input
                                id="cal-postpone-start"
                                type="datetime-local"
                                value={postponeStartsAt}
                                onChange={(e) => setPostponeStartsAt(e.target.value)}
                              />
                            </div>
                            <div className="form-group">
                              <label htmlFor="cal-postpone-end">New end</label>
                              <input
                                id="cal-postpone-end"
                                type="datetime-local"
                                value={postponeEndsAt}
                                onChange={(e) => setPostponeEndsAt(e.target.value)}
                                disabled={postponeAllDay}
                              />
                            </div>
                          </div>
                          <label
                            style={{
                              display: "flex",
                              gap: "0.5rem",
                              alignItems: "center",
                              marginBottom: "0.75rem",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={postponeAllDay}
                              onChange={(e) => setPostponeAllDay(e.target.checked)}
                            />
                            All day
                          </label>
                          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                            <Button onClick={submitPostpone} disabled={saving}>
                              {saving ? "Postponing…" : "Confirm postpone"}
                            </Button>
                            <Button
                              variant="ghost"
                              disabled={saving}
                              onClick={() => setPostponeOpen(false)}
                            >
                              Cancel postpone
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null}
                </>
              ) : null}
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <Button onClick={saveEvent} disabled={saving || !formValid}>
                  {saving
                    ? "Saving…"
                    : editingId
                      ? "Save changes"
                      : form.eventType === "appointment"
                        ? "Create meeting"
                        : "Create event"}
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
                <Button variant="ghost" disabled={saving} onClick={closeForm}>
                  Cancel
                </Button>
              </div>
            </Modal>
          ) : null}
        </div>
      </div>
    </section>
  );
}
