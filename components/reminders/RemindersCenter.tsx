"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getModuleCache, setModuleCache } from "@/lib/client/module-cache";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

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
    total: number;
  };
  overdue: ReminderItem[];
  dueSoon: ReminderItem[];
  hearings: ReminderItem[];
  meetings: ReminderItem[];
  settings?: { browserNotificationsEnabled: boolean };
};

type Tab = "overdue" | "dueSoon" | "hearings" | "meetings";

function formatWhen(iso: string) {
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
  const [tab, setTab] = useState<Tab>("overdue");

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
        if (body.data!.counts.overdue > 0) return "overdue";
        if (body.data!.counts.dueSoon > 0) return "dueSoon";
        if (current) return current;
        return "hearings";
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
    tab === "overdue"
      ? data?.overdue ?? []
      : tab === "dueSoon"
        ? data?.dueSoon ?? []
        : tab === "meetings"
          ? data?.meetings ?? []
          : data?.hearings ?? [];

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
            Overdue work, items due in the next {data?.dueSoonDays ?? 7} days, client meetings in
            the next {data?.meetingHorizonDays ?? 7} days, and hearings in the next{" "}
            {data?.hearingHorizonDays ?? 60} days. In-app only (no email). Optional browser
            alerts while LexZim is open: Settings → Reminders.
          </p>

          {error ? (
            <p role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem" }}>
              {error}
            </p>
          ) : null}

          <div className="toolbar" style={{ marginBottom: "0.75rem" }}>
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
          </div>

          {loading && !data ? (
            <p className="muted" style={{ fontSize: "0.85rem" }}>
              Loading…
            </p>
          ) : null}

          {!loading && items.length === 0 ? (
            <EmptyState
              title={
                tab === "overdue"
                  ? "Nothing overdue"
                  : tab === "dueSoon"
                    ? "Nothing due soon"
                    : tab === "meetings"
                      ? "No meetings in window"
                      : "No hearings in window"
              }
              detail="When procedures, filing deadlines, client meetings, or hearings need attention, they appear here."
            />
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>When</th>
                  <th>Matter</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
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
                      {formatWhen(item.dueAt)}
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
