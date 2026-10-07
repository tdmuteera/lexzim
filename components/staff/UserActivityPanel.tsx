"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import {
  ACTIVITY_CATEGORIES,
  activityCategory,
  activityCategoryLabel,
  activityFacts,
  activitySummary,
  activityTitle,
  activityWhere,
  type ActivityCategoryId,
} from "@/lib/staff/activity-copy";

type LoginOption = {
  id: string;
  fullName: string;
  email: string;
};

type ActivityRow = {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown>;
  ipOrUserAgent: string | null;
  userId: string | null;
  userFullName: string | null;
  userEmail: string | null;
  createdAt: string;
};

const TZ = "Africa/Harare";

function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
}

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
}

function recordLabel(entityType: string | null): string | null {
  if (!entityType) return null;
  return entityType.replace(/[_-]/g, " ");
}

export function UserActivityPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ActivityRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loginUsers, setLoginUsers] = useState<LoginOption[]>([]);
  const [filterUserId, setFilterUserId] = useState("");
  const [category, setCategory] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [limit, setLimit] = useState(120);
  const [openId, setOpenId] = useState<string | null>(null);

  const sortedLogins = useMemo(
    () => [...loginUsers].sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [loginUsers],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filterUserId) params.set("userId", filterUserId);
      if (category) params.set("category", category);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (appliedQuery) params.set("q", appliedQuery);
      params.set("limit", String(limit));
      const res = await fetch(`/api/staff/activity?${params.toString()}`, { credentials: "include" });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { items: ActivityRow[]; total?: number; loginUsers?: LoginOption[] };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Could not load user activity.");
        setItems([]);
        setTotal(0);
        return;
      }
      setItems(body.data.items);
      setTotal(body.data.total ?? body.data.items.length);
      if (body.data.loginUsers) setLoginUsers(body.data.loginUsers);
    } catch {
      setError("Could not load user activity.");
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [filterUserId, category, from, to, appliedQuery, limit]);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo(() => {
    const buckets: { key: string; label: string; rows: ActivityRow[] }[] = [];
    for (const row of items) {
      const key = dayKey(row.createdAt);
      const last = buckets[buckets.length - 1];
      if (last?.key === key) last.rows.push(row);
      else buckets.push({ key, label: dayLabel(row.createdAt), rows: [row] });
    }
    return buckets;
  }, [items]);

  const visibleCounts = useMemo(() => {
    const people = new Set(items.map((row) => row.userId).filter(Boolean));
    const byCategory = new Map<ActivityCategoryId, number>();
    for (const row of items) {
      const id = activityCategory(row.action);
      byCategory.set(id, (byCategory.get(id) ?? 0) + 1);
    }
    return { people: people.size, byCategory };
  }, [items]);

  function applySearch(event?: FormEvent) {
    event?.preventDefault();
    setLimit(120);
    setAppliedQuery(query.trim());
  }

  return (
    <div className="user-activity">
      <p className="settings-lede">
        Who did what in the firm, in the order it happened. Open an event for the amount, the
        record, and where they were signed in from.
      </p>

      <div className="user-activity-stats" aria-label="Activity summary">
        <div>
          <strong>{total}</strong>
          <span>matching events</span>
        </div>
        <div>
          <strong>{items.length}</strong>
          <span>shown</span>
        </div>
        <div>
          <strong>{visibleCounts.people}</strong>
          <span>people in this list</span>
        </div>
        <div>
          <strong>{visibleCounts.byCategory.get("sign-in") ?? 0}</strong>
          <span>sign-ins shown</span>
        </div>
      </div>

      <form className="user-activity-filters" onSubmit={applySearch}>
        <label>
          <span>Search</span>
          <input
            className="filter-select"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, receipt, subject, question..."
          />
        </label>
        <label>
          <span>Person</span>
          <select
            className="filter-select"
            value={filterUserId}
            onChange={(e) => {
              setLimit(120);
              setFilterUserId(e.target.value);
            }}
          >
            <option value="">Everyone</option>
            {sortedLogins.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Kind</span>
          <select
            className="filter-select"
            value={category}
            onChange={(e) => {
              setLimit(120);
              setCategory(e.target.value);
            }}
          >
            <option value="">All kinds</option>
            {ACTIVITY_CATEGORIES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>From</span>
          <input
            className="filter-select"
            type="date"
            value={from}
            onChange={(e) => {
              setLimit(120);
              setFrom(e.target.value);
            }}
          />
        </label>
        <label>
          <span>To</span>
          <input
            className="filter-select"
            type="date"
            value={to}
            onChange={(e) => {
              setLimit(120);
              setTo(e.target.value);
            }}
          />
        </label>
        <div className="user-activity-filter-actions">
          <Button type="submit" variant="outline" disabled={loading}>
            Search
          </Button>
          <Button type="button" variant="ghost" onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
        </div>
      </form>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? <p className="muted">Loading activity...</p> : null}

      {!loading && !error && items.length === 0 ? (
        <p className="muted">Nothing recorded for this filter.</p>
      ) : null}

      {groups.map((group) => (
        <section key={group.key} className="user-activity-day">
          <h4>{group.label}</h4>
          <ol>
            {group.rows.map((row) => {
              const summary = activitySummary(row.action, row.metadata);
              const facts = activityFacts(row.metadata);
              const where = activityWhere(row.ipOrUserAgent);
              const open = openId === row.id;
              const kind = activityCategory(row.action);
              return (
                <li key={row.id} className={`user-activity-event is-${kind}`}>
                  <time dateTime={row.createdAt}>{timeLabel(row.createdAt)}</time>
                  <div>
                    <div className="user-activity-event-head">
                      <span className={`user-activity-kind is-${kind}`}>{activityCategoryLabel(kind)}</span>
                      <strong>{activityTitle(row.action)}</strong>
                    </div>
                    <p className="user-activity-who">
                      {row.userFullName ?? "System"}
                      {row.userEmail ? <span>{row.userEmail}</span> : null}
                    </p>
                    {summary ? <p className="user-activity-summary">{summary}</p> : null}
                    <button
                      type="button"
                      className="user-activity-more"
                      aria-expanded={open}
                      onClick={() => setOpenId(open ? null : row.id)}
                    >
                      {open ? "Hide details" : "Show details"}
                    </button>
                    {open ? (
                      <dl className="user-activity-detail">
                        <div>
                          <dt>Recorded as</dt>
                          <dd>{row.action}</dd>
                        </div>
                        {recordLabel(row.entityType) ? (
                          <div>
                            <dt>Record</dt>
                            <dd>{recordLabel(row.entityType)}</dd>
                          </div>
                        ) : null}
                        {facts.map((fact) => (
                          <div key={fact.label}>
                            <dt>{fact.label}</dt>
                            <dd>{fact.value}</dd>
                          </div>
                        ))}
                        {where.device ? (
                          <div>
                            <dt>Device</dt>
                            <dd>{where.device}</dd>
                          </div>
                        ) : null}
                        {where.ip ? (
                          <div>
                            <dt>Network</dt>
                            <dd>{where.ip}</dd>
                          </div>
                        ) : null}
                      </dl>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}

      {!loading && items.length > 0 && items.length < total ? (
        <div className="user-activity-more-rows">
          <Button
            type="button"
            variant="outline"
            disabled={loading || limit >= 400}
            onClick={() => setLimit((n) => Math.min(400, n + 120))}
          >
            Show earlier events
          </Button>
          <span className="muted">
            {items.length} of {total}
          </span>
        </div>
      ) : null}
    </div>
  );
}
