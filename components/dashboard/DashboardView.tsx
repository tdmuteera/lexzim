"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatDateTime } from "@/lib/format/dates";

type DashboardData = {
  viewAll: boolean;
  isManagingPartner: boolean;
  firmName: string;
  stats: {
    openMatters: number;
    closedMatters: number;
    newClientsThisMonth: number;
    overdueProcedures: number;
  };
  overdueProcedures: Array<{
    id: string;
    matterId: string;
    title: string;
    dueAt: string | null;
    matterTitle: string | null;
    assigneeName: string | null;
    isOverdue: boolean;
  }>;
  dueSoonProcedures: Array<{
    id: string;
    matterId: string;
    title: string;
    dueAt: string | null;
    matterTitle: string | null;
    assigneeName: string | null;
  }>;
  upcomingHearings: Array<{
    id: string;
    title: string;
    nextHearingAt: string;
    courtName: string | null;
    clientDisplayName: string;
    responsibleLawyerName: string | null;
  }>;
  recentActivity: Array<{
    id: string;
    matterId: string;
    matterTitle: string;
    eventType: string;
    title: string;
    eventAt: string;
    createdByName: string | null;
  }>;
  workloadByLawyer: Array<{
    lawyerId: string | null;
    lawyerName: string;
    openMatters: number;
  }>;
};

function formatWhen(iso: string | null): string {
  return formatDateTime(iso);
}

export function DashboardView() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard", { credentials: "include" });
      const body = (await res.json()) as {
        ok: boolean;
        data?: DashboardData;
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Could not load dashboard.");
        setData(null);
        return;
      }
      setData(body.data);
    } catch {
      setError("Could not load dashboard.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <section className="view active scrollable" aria-label="Dashboard">
        <p className="muted">Loading dashboard…</p>
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="view active scrollable" aria-label="Dashboard">
        <p style={{ color: "var(--danger)" }}>{error ?? "No data."}</p>
        <Button size="sm" variant="outline" onClick={load}>
          Retry
        </Button>
      </section>
    );
  }

  const { stats } = data;

  return (
    <section className="view active scrollable" aria-label="Dashboard">
      <div style={{ marginBottom: "1rem" }}>
        <h2 style={{ margin: 0 }}>{data.firmName}</h2>
        <p className="muted" style={{ marginTop: "0.25rem" }}>
          Practice overview
          {data.viewAll ? " · firm-wide" : " · your assigned matters"}
        </p>
      </div>

      <div className="stats-grid" style={{ marginBottom: "1.25rem" }}>
        <Link href="/matters?bucket=open" className="stat-card" style={{ textDecoration: "none" }}>
          <div className="stat-label">Open matters</div>
          <div className="stat-value">{stats.openMatters}</div>
          <div className="stat-hint">Prospective, open, on hold</div>
        </Link>
        <Link href="/matters?bucket=closed" className="stat-card" style={{ textDecoration: "none" }}>
          <div className="stat-label">Closed matters</div>
          <div className="stat-value">{stats.closedMatters}</div>
          <div className="stat-hint">Closed or archived</div>
        </Link>
        <Link href="/clients" className="stat-card" style={{ textDecoration: "none" }}>
          <div className="stat-label">New clients</div>
          <div className="stat-value">{stats.newClientsThisMonth}</div>
          <div className="stat-hint">This calendar month</div>
        </Link>
        <div className="stat-card">
          <div className="stat-label">Overdue procedures</div>
          <div className="stat-value" style={stats.overdueProcedures ? { color: "var(--danger)" } : undefined}>
            {stats.overdueProcedures}
          </div>
          <div className="stat-hint">{data.viewAll ? "Firm-wide" : "Assigned to you"}</div>
        </div>
      </div>

      <div className="card-grid" style={{ marginBottom: "1.25rem" }}>
        <div className="panel">
          <div className="panel-head">
            <h3>Overdue procedures</h3>
          </div>
          <div className="panel-body">
            <ProcedureList items={data.overdueProcedures} empty="No overdue procedures." overdue />
          </div>
        </div>
        <div className="panel">
          <div className="panel-head">
            <h3>Due in 7 days</h3>
          </div>
          <div className="panel-body">
            <ProcedureList items={data.dueSoonProcedures} empty="Nothing due in the next week." />
          </div>
        </div>
      </div>

      <div className="card-grid" style={{ marginBottom: "1.25rem" }}>
        <div className="panel">
          <div className="panel-head">
            <h3>Upcoming hearings</h3>
          </div>
          <div className="panel-body">
            {data.upcomingHearings.length === 0 ? (
              <p className="muted">No upcoming hearings scheduled.</p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {data.upcomingHearings.map((h) => (
                  <li
                    key={h.id}
                    style={{
                      padding: "0.65rem 0",
                      borderBottom: "1px solid var(--border, rgba(0,0,0,0.08))",
                    }}
                  >
                    <Link href={`/matters/${h.id}`} style={{ fontWeight: 600 }}>
                      {h.title}
                    </Link>
                    <div className="muted" style={{ fontSize: "0.85rem" }}>
                      {formatWhen(h.nextHearingAt)}
                      {h.courtName ? ` · ${h.courtName}` : ""}
                      {` · ${h.clientDisplayName}`}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3>Recent activity</h3>
          </div>
          <div className="panel-body">
            {data.recentActivity.length === 0 ? (
              <p className="muted">No recent timeline activity.</p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {data.recentActivity.map((a) => (
                  <li
                    key={a.id}
                    style={{
                      padding: "0.65rem 0",
                      borderBottom: "1px solid var(--border, rgba(0,0,0,0.08))",
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{a.title}</div>
                    <div className="muted" style={{ fontSize: "0.85rem" }}>
                      {formatWhen(a.eventAt)} ·{" "}
                      <Link href={`/matters/${a.matterId}`}>{a.matterTitle}</Link>
                      {a.createdByName ? ` · ${a.createdByName}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {data.isManagingPartner ? (
        <div className="panel">
          <div className="panel-head">
            <h3>Workload by lawyer</h3>
            <Badge tone="pending">Managing Partner</Badge>
          </div>
          <div className="panel-body">
            {data.workloadByLawyer.length === 0 ? (
              <p className="muted">No open matters yet.</p>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Lawyer</th>
                      <th>Open matters</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.workloadByLawyer.map((row) => (
                      <tr key={row.lawyerId ?? "unassigned"}>
                        <td>{row.lawyerName}</td>
                        <td>{row.openMatters}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}

      <div style={{ marginTop: "1rem" }}>
        <Button size="sm" variant="outline" onClick={load}>
          Refresh
        </Button>
      </div>
    </section>
  );
}

function ProcedureList({
  items,
  empty,
  overdue = false,
}: {
  items: Array<{
    id: string;
    matterId: string;
    title: string;
    dueAt: string | null;
    matterTitle: string | null;
    assigneeName: string | null;
  }>;
  empty: string;
  overdue?: boolean;
}) {
  if (items.length === 0) return <p className="muted">{empty}</p>;
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {items.map((item) => (
        <li
          key={item.id}
          style={{
            padding: "0.65rem 0",
            borderBottom: "1px solid var(--border, rgba(0,0,0,0.08))",
            background: overdue ? "rgba(168, 83, 69, 0.06)" : undefined,
          }}
        >
          <div style={{ fontWeight: 600 }}>{item.title}</div>
          <div className="muted" style={{ fontSize: "0.85rem" }}>
            <span style={overdue ? { color: "var(--danger)", fontWeight: 600 } : undefined}>
              {formatWhen(item.dueAt)}
            </span>
            {item.matterTitle ? (
              <>
                {" · "}
                <Link href={`/matters/${item.matterId}`}>{item.matterTitle}</Link>
              </>
            ) : null}
            {item.assigneeName ? ` · ${item.assigneeName}` : ""}
          </div>
        </li>
      ))}
    </ul>
  );
}
