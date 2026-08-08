"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { OnboardingChecklist } from "@/components/onboarding/OnboardingChecklist";
import { centsToDisplay } from "@/lib/billing/money";
import { formatDateTime } from "@/lib/format/dates";

type ReminderItem = {
  id: string;
  kind: string;
  title: string;
  dueAt: string;
  matterId: string | null;
  matterTitle: string | null;
  href: string;
  isOverdue: boolean;
};

type DashboardData = {
  viewAll: boolean;
  isManagingPartner: boolean;
  firmName: string;
  permissions: {
    calendar: boolean;
    billing: boolean;
    trust: boolean;
    intake: boolean;
  };
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
  calendarReminders: {
    counts: { overdue: number; dueSoon: number; hearings: number; total: number };
    overdue: ReminderItem[];
    dueSoon: ReminderItem[];
    hearings: ReminderItem[];
  } | null;
  overdueInvoices: Array<{
    id: string;
    invoiceNumber: string;
    status: string;
    dueDate: string;
    currency: string;
    balanceCents: number;
    matterTitle: string;
    clientName: string;
    href: string;
  }> | null;
  trustAttention: {
    note: string;
    attentionCount: number;
    accounts: Array<{
      id: string;
      name: string;
      currency: string;
      balanceCents: number;
      flag: string | null;
    }>;
    clients: Array<{
      clientId: string;
      clientName: string;
      currency: string;
      balanceCents: number;
      flag: string | null;
      href: string;
    }>;
  } | null;
  openIntakes: Array<{
    id: string;
    prospectName: string;
    areaOfLaw: string | null;
    opposingParty: string | null;
    assigneeName: string | null;
    updatedAt: string;
    href: string;
  }> | null;
  labels: { billing: string; trust: string };
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

  const { stats, permissions } = data;

  return (
    <section className="view active scrollable" aria-label="Dashboard">
      <div style={{ marginBottom: "1rem" }}>
        <h2 style={{ margin: 0 }}>{data.firmName}</h2>
        <p className="muted" style={{ marginTop: "0.25rem" }}>
          Practice overview
          {data.viewAll ? " · firm-wide" : " · your assigned matters"}
        </p>
      </div>

      <OnboardingChecklist />

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
        {permissions.billing && data.overdueInvoices ? (
          <Link href="/billing" className="stat-card" style={{ textDecoration: "none" }}>
            <div className="stat-label">Overdue invoices</div>
            <div
              className="stat-value"
              style={data.overdueInvoices.length ? { color: "var(--danger)" } : undefined}
            >
              {data.overdueInvoices.length}
            </div>
            <div className="stat-hint">{data.labels.billing}</div>
          </Link>
        ) : null}
        {permissions.trust && data.trustAttention ? (
          <Link href="/trust" className="stat-card" style={{ textDecoration: "none" }}>
            <div className="stat-label">Trust attention</div>
            <div
              className="stat-value"
              style={
                data.trustAttention.attentionCount
                  ? { color: "var(--danger)" }
                  : undefined
              }
            >
              {data.trustAttention.attentionCount}
            </div>
            <div className="stat-hint">{data.labels.trust}</div>
          </Link>
        ) : null}
        {permissions.intake && data.openIntakes ? (
          <Link href="/intake" className="stat-card" style={{ textDecoration: "none" }}>
            <div className="stat-label">Open intakes</div>
            <div className="stat-value">{data.openIntakes.length}</div>
            <div className="stat-hint">Prospects awaiting conversion</div>
          </Link>
        ) : null}
        {permissions.calendar && data.calendarReminders ? (
          <Link href="/reminders" className="stat-card" style={{ textDecoration: "none" }}>
            <div className="stat-label">Reminders</div>
            <div className="stat-value">{data.calendarReminders.counts.total}</div>
            <div className="stat-hint">
              {data.calendarReminders.counts.overdue} overdue ·{" "}
              {data.calendarReminders.counts.hearings} hearings
            </div>
          </Link>
        ) : null}
      </div>

      {permissions.calendar && data.calendarReminders ? (
        <div className="card-grid" style={{ marginBottom: "1.25rem" }}>
          <div className="panel">
            <div className="panel-head">
              <h3>Hearings & deadlines</h3>
              <Link href="/reminders" className="btn btn-outline btn-sm">
                Reminders
              </Link>
            </div>
            <div className="panel-body">
              <ReminderList
                items={[
                  ...data.calendarReminders.hearings,
                  ...data.calendarReminders.overdue.filter((i) => i.kind === "deadline"),
                  ...data.calendarReminders.dueSoon.filter((i) => i.kind === "deadline"),
                ].slice(0, 10)}
                empty="No upcoming hearings or open deadlines."
              />
            </div>
          </div>
          <div className="panel">
            <div className="panel-head">
              <h3>Overdue deadlines & procedures</h3>
            </div>
            <div className="panel-body">
              <ReminderList
                items={data.calendarReminders.overdue}
                empty="Nothing overdue."
                emphasizeOverdue
              />
            </div>
          </div>
        </div>
      ) : null}

      {(permissions.billing && data.overdueInvoices) ||
      (permissions.trust && data.trustAttention) ||
      (permissions.intake && data.openIntakes) ? (
        <div className="card-grid" style={{ marginBottom: "1.25rem" }}>
          {permissions.billing && data.overdueInvoices ? (
            <div className="panel">
              <div className="panel-head">
                <h3>Overdue fee invoices</h3>
                <Badge>{data.labels.billing}</Badge>
              </div>
              <div className="panel-body">
                {data.overdueInvoices.length === 0 ? (
                  <p className="muted">No overdue fee balances.</p>
                ) : (
                  <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {data.overdueInvoices.map((inv) => (
                      <li
                        key={inv.id}
                        style={{
                          padding: "0.65rem 0",
                          borderBottom: "1px solid var(--border, rgba(0,0,0,0.08))",
                        }}
                      >
                        <Link href={inv.href} style={{ fontWeight: 600 }}>
                          {inv.invoiceNumber}
                        </Link>
                        <div className="muted" style={{ fontSize: "0.85rem" }}>
                          Due {inv.dueDate} · {inv.clientName} · {inv.matterTitle} ·{" "}
                          <span style={{ color: "var(--danger)", fontWeight: 600 }}>
                            {centsToDisplay(inv.balanceCents, inv.currency)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : null}

          {permissions.trust && data.trustAttention ? (
            <div className="panel">
              <div className="panel-head">
                <h3>Trust attention</h3>
                <Badge>{data.labels.trust}</Badge>
              </div>
              <div className="panel-body">
                <p className="muted" style={{ fontSize: "0.8rem", marginTop: 0 }}>
                  {data.trustAttention.note}
                </p>
                {data.trustAttention.clients.length === 0 &&
                !data.trustAttention.accounts.some((a) => a.flag) ? (
                  <p className="muted">No trust flags right now.</p>
                ) : (
                  <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {data.trustAttention.accounts
                      .filter((a) => a.flag)
                      .map((a) => (
                        <li key={a.id} style={{ padding: "0.5rem 0" }}>
                          <Link href="/trust" style={{ fontWeight: 600 }}>
                            {a.name}
                          </Link>
                          <div className="muted" style={{ fontSize: "0.85rem" }}>
                            {a.flag} · {centsToDisplay(a.balanceCents, a.currency)}
                          </div>
                        </li>
                      ))}
                    {data.trustAttention.clients.slice(0, 6).map((c) => (
                      <li key={c.clientId} style={{ padding: "0.5rem 0" }}>
                        <Link href={c.href} style={{ fontWeight: 600 }}>
                          {c.clientName}
                        </Link>
                        <div className="muted" style={{ fontSize: "0.85rem" }}>
                          {c.flag ?? "held"} ·{" "}
                          {centsToDisplay(c.balanceCents, c.currency)}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : null}

          {permissions.intake && data.openIntakes ? (
            <div className="panel">
              <div className="panel-head">
                <h3>Open intakes</h3>
                <Link href="/intake" className="btn btn-outline btn-sm">
                  Intake
                </Link>
              </div>
              <div className="panel-body">
                {data.openIntakes.length === 0 ? (
                  <p className="muted">No open prospects.</p>
                ) : (
                  <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {data.openIntakes.map((i) => (
                      <li
                        key={i.id}
                        style={{
                          padding: "0.65rem 0",
                          borderBottom: "1px solid var(--border, rgba(0,0,0,0.08))",
                        }}
                      >
                        <Link href={i.href} style={{ fontWeight: 600 }}>
                          {i.prospectName}
                        </Link>
                        <div className="muted" style={{ fontSize: "0.85rem" }}>
                          {i.areaOfLaw ?? "Area n/a"}
                          {i.opposingParty ? ` · vs ${i.opposingParty}` : ""}
                          {i.assigneeName ? ` · ${i.assigneeName}` : ""}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

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
            <h3>Upcoming hearings (matter field)</h3>
          </div>
          <div className="panel-body">
            {data.upcomingHearings.length === 0 ? (
              <p className="muted">No upcoming hearings on matter records.</p>
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

function ReminderList({
  items,
  empty,
  emphasizeOverdue = false,
}: {
  items: ReminderItem[];
  empty: string;
  emphasizeOverdue?: boolean;
}) {
  if (!items.length) return <p className="muted">{empty}</p>;
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {items.map((item) => (
        <li
          key={`${item.kind}-${item.id}`}
          style={{
            padding: "0.65rem 0",
            borderBottom: "1px solid var(--border, rgba(0,0,0,0.08))",
            background:
              emphasizeOverdue && item.isOverdue
                ? "rgba(168, 83, 69, 0.06)"
                : undefined,
          }}
        >
          <Link href={item.href} style={{ fontWeight: 600 }}>
            {item.title}
          </Link>
          <div className="muted" style={{ fontSize: "0.85rem" }}>
            <span
              style={
                item.isOverdue ? { color: "var(--danger)", fontWeight: 600 } : undefined
              }
            >
              {formatWhen(item.dueAt)}
            </span>
            {` · ${item.kind}`}
            {item.matterTitle ? ` · ${item.matterTitle}` : ""}
          </div>
        </li>
      ))}
    </ul>
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
