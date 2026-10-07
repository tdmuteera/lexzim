"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getModuleCache, setModuleCache } from "@/lib/client/module-cache";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SortableTh } from "@/components/ui/SortableTh";
import { useTableSort } from "@/lib/ui/table-sort";

const REMINDERS_CACHE_KEY = "module:/api/reminders";

export type ReminderItem = {
  id: string;
  kind: string;
  title: string;
  dueAt: string;
  matterId: string | null;
  matterTitle: string | null;
  href: string;
  isOverdue: boolean;
  meta?: string | null;
};

export type RemindersPayload = {
  generatedAt: string;
  dueSoonDays: number;
  hearingHorizonDays?: number;
  meetingHorizonDays?: number;
  counts: {
    overdue: number;
    dueSoon: number;
    hearings: number;
    meetings: number;
    calendar?: number;
    tracking?: number;
    total: number;
  };
  overdue: ReminderItem[];
  dueSoon: ReminderItem[];
  hearings: ReminderItem[];
  meetings: ReminderItem[];
  calendar?: ReminderItem[];
  tracking?: ReminderItem[];
  settings?: { browserNotificationsEnabled: boolean };
};

type Tab = "calendar" | "overdue" | "dueSoon" | "hearings" | "meetings" | "tracking";

function formatWhen(iso: string, kind?: string) {
  if (kind === "tracking") {
    return new Date(iso).toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function RemindersCenter() {
  const [data, setData] = useState<RemindersPayload | null>(() =>
    getModuleCache<RemindersPayload>(REMINDERS_CACHE_KEY),
  );
  const [loading, setLoading] = useState(() => !getModuleCache(REMINDERS_CACHE_KEY));
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("calendar");

  const load = useCallback(async (opts?: { background?: boolean }) => {
    const background = Boolean(opts?.background);
    if (!background) setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reminders", { credentials: "include" });
      const body = (await res.json()) as {
        ok: boolean;
        data?: RemindersPayload;
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        if (!background) {
          setError(body.error?.message ?? "Could not load reminders.");
          setData(null);
        }
        return;
      }
      setModuleCache(REMINDERS_CACHE_KEY, body.data);
      setData(body.data);
      setTab((current) => {
        if ((body.data!.counts.calendar ?? 0) > 0) return "calendar";
        if (body.data!.counts.overdue > 0) return "overdue";
        if (body.data!.counts.dueSoon > 0) return "dueSoon";
        if (current) return current;
        return "calendar";
      });
    } catch {
      if (!background) {
        setError("Could not load reminders.");
        setData(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const cached = getModuleCache<RemindersPayload>(REMINDERS_CACHE_KEY);
    void load({ background: Boolean(cached) });
  }, [load]);

  const items =
    tab === "calendar"
      ? data?.calendar ?? []
      : tab === "overdue"
        ? data?.overdue ?? []
        : tab === "dueSoon"
          ? data?.dueSoon ?? []
      : tab === "meetings"
        ? data?.meetings ?? []
        : tab === "tracking"
          ? data?.tracking ?? []
          : data?.hearings ?? [];

  const sortAccessors = useMemo(
    () => ({
      item: (r: ReminderItem) => r.title,
      when: (r: ReminderItem) => r.dueAt,
      matter: (r: ReminderItem) => r.matterTitle ?? "",
      type: (r: ReminderItem) => r.kind,
    }),
    [],
  );
  const { sortedRows, sortKey, sortDir, toggleSort } = useTableSort(items, sortAccessors, {
    key: "when",
    dir: "asc",
  });

  return (
    <section className="view active scrollable" aria-label="Reminders">
      <div className="panel">
        <div className="panel-head">
          <h3>Reminders</h3>
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
        </div>
        <div className="panel-body">
          <p className="muted" style={{ marginTop: 0, fontSize: "0.8rem" }}>
            Calendar lists every diary event you can see. Matter tracking is what someone wrote
            on a case, with its date. Other tabs keep overdue work, due soon, meetings, and
            hearings. The only automatic calendar email is an 8:00 am reminder on the day of
            the event (Africa/Harare).
          </p>

          {error ? (
            <p role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem" }}>
              {error}
            </p>
          ) : null}

          <div className="toolbar" style={{ marginBottom: "0.75rem" }}>
            <Button
              size="sm"
              variant={tab === "calendar" ? "primary" : "outline"}
              onClick={() => setTab("calendar")}
            >
              Calendar ({data?.counts.calendar ?? 0})
            </Button>
            <Button
              size="sm"
              variant={tab === "overdue" ? "primary" : "outline"}
              onClick={() => setTab("overdue")}
            >
              Overdue ({data?.counts.overdue ?? 0})
            </Button>
            <Button
              size="sm"
              variant={tab === "dueSoon" ? "primary" : "outline"}
              onClick={() => setTab("dueSoon")}
            >
              Due soon ({data?.counts.dueSoon ?? 0})
            </Button>
            <Button
              size="sm"
              variant={tab === "meetings" ? "primary" : "outline"}
              onClick={() => setTab("meetings")}
            >
              Meetings ({data?.counts.meetings ?? 0})
            </Button>
            <Button
              size="sm"
              variant={tab === "hearings" ? "primary" : "outline"}
              onClick={() => setTab("hearings")}
            >
              Hearings ({data?.counts.hearings ?? 0})
            </Button>
            <Button
              size="sm"
              variant={tab === "tracking" ? "primary" : "outline"}
              onClick={() => setTab("tracking")}
            >
              Matter tracking ({data?.counts.tracking ?? 0})
            </Button>
          </div>

          {loading && !data ? (
            <p className="muted" style={{ fontSize: "0.85rem" }}>
              Loading…
            </p>
          ) : null}

          {!loading && items.length === 0 ? (
            <EmptyState
              title={
                tab === "calendar"
                  ? "No upcoming calendar events"
                  : tab === "overdue"
                    ? "Nothing overdue"
                    : tab === "dueSoon"
                      ? "Nothing due soon"
                      : tab === "meetings"
                        ? "No meetings in window"
                        : tab === "tracking"
                          ? "No matter tracking in the next 60 days"
                          : "No hearings in window"
              }
              detail="When procedures, filing deadlines, client meetings, hearings, or a matter tracking date need attention, they appear here."
            />
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <SortableTh
                    label="Item"
                    columnKey="item"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="When"
                    columnKey="when"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="Matter"
                    columnKey="matter"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="Type"
                    columnKey="type"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((item) => (
                  <tr
                    key={item.id}
                    style={
                      item.isOverdue
                        ? { background: "rgba(168, 83, 69, 0.08)" }
                        : undefined
                    }
                  >
                    <td>
                      <Link href={item.href}>{item.title}</Link>
                      {item.isOverdue ? (
                        <div style={{ marginTop: "0.25rem" }}>
                          <Badge tone="danger">Overdue</Badge>
                        </div>
                      ) : null}
                    </td>
                    <td
                      style={
                        item.isOverdue
                          ? { color: "var(--danger)", fontWeight: 600 }
                          : undefined
                      }
                    >
                      {formatWhen(item.dueAt, item.kind)}
                    </td>
                    <td>
                      {item.matterId ? (
                        <Link href={`/matters/${item.matterId}`}>
                          {item.matterTitle ?? "Matter"}
                        </Link>
                      ) : (
                        <span className="muted">Firm diary</span>
                      )}
                    </td>
                    <td>{item.meta ?? item.kind}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}
