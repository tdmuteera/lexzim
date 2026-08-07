"use client";

import { useCallback, useEffect, useState } from "react";
import { Can } from "@/components/auth/Can";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  USER_EVENT_TYPES,
  eventTypeLabel,
  type UserEventType,
} from "@/lib/timeline/validation";

type TimelineEvent = {
  id: string;
  eventType: string;
  eventTypeLabel: string;
  title: string;
  body: string | null;
  eventAt: string;
  createdByName: string | null;
};

type FormState = {
  eventType: UserEventType;
  title: string;
  body: string;
  eventAt: string;
};

const emptyForm: FormState = {
  eventType: "note",
  title: "",
  body: "",
  eventAt: "",
};

function badgeTone(
  eventType: string,
): "open" | "pending" | "closed" | "danger" | "default" | "individual" | "company" {
  switch (eventType) {
    case "note":
      return "default";
    case "call":
      return "open";
    case "email":
      return "individual";
    case "meeting":
      return "company";
    case "status_change":
      return "pending";
    case "procedure":
      return "danger";
    case "system":
    case "document":
      return "closed";
    default:
      return "default";
  }
}

type MatterTimelinePanelProps = {
  matterId: string;
  /** Optional seed from server render; panel refreshes on load. */
  initialEvents?: TimelineEvent[];
};

export function MatterTimelinePanel({
  matterId,
  initialEvents = [],
}: MatterTimelinePanelProps) {
  const [items, setItems] = useState<TimelineEvent[]>(initialEvents);
  const [loading, setLoading] = useState(initialEvents.length === 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [typeFilter, setTypeFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (typeFilter) params.set("type", typeFilter);
      const qs = params.toString();
      const res = await fetch(
        `/api/matters/${matterId}/timeline${qs ? `?${qs}` : ""}`,
        { credentials: "include" },
      );
      const body = (await res.json()) as {
        ok: boolean;
        data?: { items: TimelineEvent[] };
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not load timeline.");
        setItems([]);
        return;
      }
      setItems(body.data?.items ?? []);
    } catch {
      setError("Could not load timeline.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [matterId, typeFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/matters/${matterId}/timeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          eventType: form.eventType,
          title: form.title,
          body: form.body || null,
          eventAt: form.eventAt || null,
        }),
      });
      const body = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not add entry.");
        return;
      }
      setShowForm(false);
      setForm(emptyForm);
      await load();
    } catch {
      setError("Could not add entry.");
    } finally {
      setSaving(false);
    }
  }

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
          <h4 style={{ margin: 0 }}>Timeline</h4>
          <p className="muted" style={{ margin: "0.25rem 0 0" }}>
            Notes, calls, emails, meetings, and system events
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <select
            className="filter-select"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="Filter timeline by type"
          >
            <option value="">All types</option>
            {USER_EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {eventTypeLabel(t)}
              </option>
            ))}
            <option value="status_change">Status</option>
            <option value="procedure">Procedure</option>
            <option value="system">System</option>
          </select>
          <Can permission="matters.edit">
            <Button
              size="sm"
              onClick={() => {
                setForm(emptyForm);
                setShowForm(true);
              }}
            >
              Add entry
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
          <h4 style={{ marginTop: 0 }}>New timeline entry</h4>
          <div className="grid-2">
            <div className="form-group">
              <label htmlFor="tl-type">Type</label>
              <select
                id="tl-type"
                value={form.eventType}
                onChange={(e) =>
                  setForm((f) => ({ ...f, eventType: e.target.value as UserEventType }))
                }
              >
                {USER_EVENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {eventTypeLabel(t)}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="tl-at">When</label>
              <input
                id="tl-at"
                type="datetime-local"
                value={form.eventAt}
                onChange={(e) => setForm((f) => ({ ...f, eventAt: e.target.value }))}
              />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="tl-title">Title</label>
            <input
              id="tl-title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              required
              placeholder="Short summary"
            />
          </div>
          <div className="form-group">
            <label htmlFor="tl-body">Details</label>
            <textarea
              id="tl-body"
              rows={4}
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              placeholder="Notes from the call, email summary, meeting minutes…"
            />
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Saving…" : "Save entry"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={saving}
              onClick={() => setShowForm(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {loading ? (
        <p className="muted">Loading timeline…</p>
      ) : items.length === 0 ? (
        <p className="muted">No timeline events yet.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {items.map((event) => (
            <li
              key={event.id}
              style={{
                padding: "0.85rem 0",
                borderBottom: "1px solid var(--border, rgba(0,0,0,0.08))",
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  alignItems: "center",
                  flexWrap: "wrap",
                  marginBottom: "0.25rem",
                }}
              >
                <Badge tone={badgeTone(event.eventType)}>
                  {event.eventTypeLabel}
                </Badge>
                <span style={{ fontWeight: 600 }}>{event.title}</span>
              </div>
              <div className="muted" style={{ fontSize: "0.85rem" }}>
                {new Date(event.eventAt).toLocaleString()}
                {event.createdByName ? ` · ${event.createdByName}` : ""}
              </div>
              {event.body ? (
                <p style={{ marginTop: "0.4rem", whiteSpace: "pre-wrap" }}>{event.body}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
