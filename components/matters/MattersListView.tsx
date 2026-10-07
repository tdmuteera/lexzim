"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Can } from "@/components/auth/Can";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SortableTh } from "@/components/ui/SortableTh";
import { AREA_OF_LAW_OPTIONS } from "@/lib/db/mvp-types";
import { formatTrackingDate } from "@/lib/matters/tracking";
import { MATTER_STATUSES, statusLabel } from "@/lib/matters/validation";
import { useTableSort } from "@/lib/ui/table-sort";

type SerializedMatter = {
  id: string;
  title: string;
  status: string;
  statusLabel: string;
  areaOfLaw: string;
  matterNumber: string | null;
  clientDisplayName: string | null;
  responsibleLawyerName: string | null;
  nextHearingAt: string | null;
  priority: string | null;
  updatedAt: string;
  trackingSummary: string | null;
  trackingOn: string | null;
};

type Lawyer = { id: string; fullName: string; email: string };

function statusTone(status: string): "open" | "pending" | "closed" | "danger" | "default" {
  switch (status) {
    case "open":
      return "open";
    case "prospective":
    case "on_hold":
      return "pending";
    case "closed":
    case "archived":
      return "closed";
    default:
      return "default";
  }
}

export function MattersListView({
  initialClientId,
  initialBucket,
}: {
  initialClientId?: string;
  initialBucket?: string;
}) {
  const [items, setItems] = useState<SerializedMatter[]>([]);
  const [lawyers, setLawyers] = useState<Lawyer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [bucket, setBucket] = useState(
    initialBucket === "closed" || initialBucket === "all" || initialBucket === "open"
      ? initialBucket
      : "open",
  );
  const [status, setStatus] = useState("");
  const [areaOfLaw, setAreaOfLaw] = useState("");
  const [lawyerId, setLawyerId] = useState("");
  const [clientId, setClientId] = useState(initialClientId ?? "");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      params.set("bucket", bucket);
      if (status) params.set("status", status);
      if (areaOfLaw) params.set("areaOfLaw", areaOfLaw);
      if (lawyerId) params.set("responsibleLawyerId", lawyerId);
      if (clientId) params.set("clientId", clientId);
      params.set("includeLawyers", "1");

      const res = await fetch(`/api/matters?${params.toString()}`, {
        credentials: "include",
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { items: SerializedMatter[]; lawyers?: Lawyer[] };
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not load matters.");
        setItems([]);
        return;
      }
      setItems(body.data?.items ?? []);
      if (body.data?.lawyers) setLawyers(body.data.lawyers);
    } catch {
      setError("Could not load matters. Check your connection.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [q, bucket, status, areaOfLaw, lawyerId, clientId]);

  // Filters load immediately; only debounce free-text search typing.
  useEffect(() => {
    if (!q) {
      void load();
      return;
    }
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load, q]);

  const accessors = useMemo(
    () => ({
      matter: (m: SerializedMatter) => m.matterNumber || m.title,
      title: (m: SerializedMatter) => m.title,
      client: (m: SerializedMatter) => m.clientDisplayName,
      area: (m: SerializedMatter) => m.areaOfLaw,
      status: (m: SerializedMatter) => m.statusLabel,
      tracking: (m: SerializedMatter) => m.trackingOn,
      lawyer: (m: SerializedMatter) => m.responsibleLawyerName,
      hearing: (m: SerializedMatter) => m.nextHearingAt,
    }),
    [],
  );
  const { sortedRows, sortKey, sortDir, toggleSort } = useTableSort(items, accessors, {
    key: "matter",
    dir: "asc",
  });

  const newHref = clientId
    ? `/matters/new?clientId=${encodeURIComponent(clientId)}`
    : "/matters/new";

  return (
    <section className="view active scrollable" aria-label="Matter Management">
      <div className="panel">
        <div className="panel-head">
          <h3>Matter Management</h3>
          <Can permission="matters.create">
            <Link href={newHref} className="btn btn-primary btn-sm">
              New matter
            </Link>
          </Can>
        </div>
        <div className="panel-body">
          <div className="toolbar">
            <input
              className="search-input"
              placeholder="Search title, number, client…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search matters"
            />
            <select
              className="filter-select"
              value={bucket}
              onChange={(e) => {
                setBucket(e.target.value);
                setStatus("");
              }}
              aria-label="Open or closed"
            >
              <option value="open">Open matters</option>
              <option value="closed">Closed matters</option>
              <option value="all">All matters</option>
            </select>
            <select
              className="filter-select"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              aria-label="Filter by status"
            >
              <option value="">Any status</option>
              {MATTER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
            <select
              className="filter-select"
              value={areaOfLaw}
              onChange={(e) => setAreaOfLaw(e.target.value)}
              aria-label="Filter by area"
            >
              <option value="">All areas</option>
              {AREA_OF_LAW_OPTIONS.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>
            <select
              className="filter-select"
              value={lawyerId}
              onChange={(e) => setLawyerId(e.target.value)}
              aria-label="Filter by lawyer"
            >
              <option value="">All lawyers</option>
              {lawyers.map((lawyer) => (
                <option key={lawyer.id} value={lawyer.id}>
                  {lawyer.fullName}
                </option>
              ))}
            </select>
            <div className="toolbar-spacer" />
            <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
              Refresh
            </Button>
          </div>

          {error ? (
            <p style={{ color: "var(--danger)", marginBottom: "0.75rem" }}>{error}</p>
          ) : null}

          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <SortableTh
                    label="Matter"
                    columnKey="title"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="Client"
                    columnKey="client"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="Area"
                    columnKey="area"
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
                  <SortableTh
                    label="Tracking"
                    columnKey="tracking"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="Lawyer"
                    columnKey="lawyer"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="Next hearing"
                    columnKey="hearing"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="muted">
                      Loading matters…
                    </td>
                  </tr>
                ) : sortedRows.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <EmptyState
                        icon="list"
                        title="No matters match your filters"
                        detail="Try another status bucket or create a new matter."
                      />
                    </td>
                  </tr>
                ) : (
                  sortedRows.map((matter) => (
                    <tr key={matter.id}>
                      <td>
                        <Link href={`/matters/${matter.id}`} style={{ fontWeight: 600 }}>
                          {matter.title}
                        </Link>
                        {matter.matterNumber ? (
                          <div className="muted" style={{ fontSize: "0.8rem" }}>
                            {matter.matterNumber}
                          </div>
                        ) : null}
                      </td>
                      <td>{matter.clientDisplayName ?? "—"}</td>
                      <td>{matter.areaOfLaw}</td>
                      <td>
                        <Badge tone={statusTone(matter.status)}>
                          {matter.statusLabel}
                        </Badge>
                      </td>
                      <td>
                        {matter.trackingSummary && matter.trackingOn ? (
                          <>
                            {matter.trackingSummary}
                            <div className="muted" style={{ fontSize: "0.8rem" }}>
                              {formatTrackingDate(matter.trackingOn)}
                            </div>
                          </>
                        ) : (
                          <span className="muted">Not set</span>
                        )}
                      </td>
                      <td>{matter.responsibleLawyerName ?? "—"}</td>
                      <td>
                        {matter.nextHearingAt
                          ? new Date(matter.nextHearingAt).toLocaleDateString()
                          : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
