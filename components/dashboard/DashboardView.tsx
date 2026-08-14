"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  AnimatedBarChart,
  AnimatedDonutChart,
  useCountUp,
} from "@/components/dashboard/DashboardCharts";
import { FinanceKpisPanel } from "@/components/finance/FinanceKpisPanel";
import { OnboardingChecklist } from "@/components/onboarding/OnboardingChecklist";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { centsToDisplay } from "@/lib/billing/money";
import { getModuleCache, setModuleCache } from "@/lib/client/module-cache";
import { formatDateTime } from "@/lib/format/dates";
import type { FinanceKpis } from "@/lib/repos/finance-kpis";
import type { NavIcon } from "@/lib/nav";

const DASHBOARD_CACHE_KEY = "module:/api/dashboard";

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
  roleName?: string;
  permissions: {
    calendar: boolean;
    billing: boolean;
    trust: boolean;
  };
  stats: {
    openMatters: number;
    closedMatters: number;
    newClientsThisMonth: number;
    overdueProcedures: number;
  };
  commandKpis: {
    activeClients: number;
    newClientsThisMonth: number;
    highPriorityOpen: number;
    hearingsThisWeek: number;
    nextHearingAt: string | null;
    outstandingFeesCents: number;
    outstandingCurrency: string;
  };
  statusMix: { byStatus: Record<string, number>; total: number };
  feeRevenue: Array<{
    key: string;
    label: string;
    totalCents: number;
    currency: string;
  }> | null;
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
  financeKpis: FinanceKpis | null;
  labels: { billing: string; trust: string };
};

const STATUS_COLORS: Record<string, string> = {
  open: "#3A7356",
  prospective: "#A07C38",
  on_hold: "#5C6570",
  closed: "#9A968C",
  archived: "#CBC5BB",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  prospective: "Prospective",
  on_hold: "On hold",
  closed: "Closed",
  archived: "Archived",
};

function greetingForHour(h: number) {
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function formatShortDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

function KpiCard({
  href,
  icon,
  label,
  value,
  hint,
  delay,
}: {
  href?: string;
  icon: NavIcon;
  label: string;
  value: number | string;
  hint: string;
  delay: number;
}) {
  const numeric = typeof value === "number" ? value : null;
  const counted = useCountUp(numeric ?? 0, 900 + delay * 80);
  const display = numeric == null ? value : counted;

  const inner = (
    <>
      <div className="stat-icon">
        <Icon name={icon} />
      </div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{display}</div>
      <div className="stat-hint">{hint}</div>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="stat-card"
        style={{ textDecoration: "none", animationDelay: `${delay * 0.06}s` }}
      >
        {inner}
      </Link>
    );
  }
  return (
    <div className="stat-card" style={{ animationDelay: `${delay * 0.06}s` }}>
      {inner}
    </div>
  );
}

export function DashboardView() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(() =>
    getModuleCache<DashboardData>(DASHBOARD_CACHE_KEY),
  );
  const [loading, setLoading] = useState(() => !getModuleCache(DASHBOARD_CACHE_KEY));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (opts?: { background?: boolean }) => {
    const background = Boolean(opts?.background);
    if (!background) setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard", { credentials: "include" });
      const body = (await res.json()) as {
        ok: boolean;
        data?: DashboardData;
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        if (!background) {
          setError(body.error?.message ?? "Could not load dashboard.");
          setData(null);
        }
        return;
      }
      setModuleCache(DASHBOARD_CACHE_KEY, body.data);
      setData(body.data);
    } catch {
      if (!background) {
        setError("Could not load dashboard.");
        setData(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const cached = getModuleCache<DashboardData>(DASHBOARD_CACHE_KEY);
    void load({ background: Boolean(cached) });
  }, [load]);

  const now = useMemo(() => new Date(), [data]);
  const greeting = greetingForHour(now.getHours());
  const dateLine = now.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const roleLabel =
    data?.roleName ?? user?.role.name ?? "Colleague";
  const firmLabel = data?.firmName ?? user?.firm.name ?? "LexZim";

  // Instant shell: constants + icons first; numbers fill when data arrives.
  if (loading && !data) {
    return (
      <section
        className="view active scrollable dash-command"
        aria-label="Dashboard"
        id="view-dashboard"
        aria-busy="true"
      >
        <div className="dash-hero">
          <div className="dash-greeting">
            <h2>
              {greeting}, {roleLabel}
            </h2>
            <p>
              {dateLine} · {firmLabel}
            </p>
          </div>
          <div className="dash-hero-actions">
            <Link href="/ai" className="ai-launch">
              <div className="ai-launch-icon">
                <Icon name="robot" />
              </div>
              <div className="ai-launch-text">
                <strong>AI Assistant</strong>
                <em>Ask · Research · Draft</em>
              </div>
            </Link>
          </div>
        </div>

        <div className="alert-pills">
          <span className="alert-pill ok">
            <Icon name="calendar" /> Hearings this week
          </span>
          <span className="alert-pill ok">
            <Icon name="invoice" /> Fee notes
          </span>
          <span className="alert-pill ok">
            <Icon name="bell" /> Deadlines
          </span>
        </div>

        <div className="stats-grid dash-kpi-row">
          {(
            [
              ["users", "Active clients", "This month"],
              ["briefcase", "Open matters", "High priority"],
              ["calendar", "Hearings", "This week"],
              ["invoice", "Outstanding fees", "Open balances"],
              ["bell", "Deadlines", "Due soon"],
            ] as Array<[NavIcon, string, string]>
          ).map(([icon, label, hint], i) => (
            <div key={label} className="stat-card" style={{ animationDelay: `${i * 0.06}s` }}>
              <div className="stat-icon">
                <Icon name={icon} />
              </div>
              <div className="stat-label">{label}</div>
              <div className="stat-value muted">—</div>
              <div className="stat-hint">{hint}</div>
            </div>
          ))}
        </div>

        <div className="dash-skeleton-row dash-skeleton-charts" style={{ marginTop: "0.5rem" }}>
          <div className="dash-skeleton-block" style={{ height: 240 }} />
          <div className="dash-skeleton-block" style={{ height: 240 }} />
          <div className="dash-skeleton-block" style={{ height: 240 }} />
        </div>
      </section>
    );
  }

  if ((error || !data) && !loading) {
    return (
      <section className="view active scrollable" aria-label="Dashboard">
        <p style={{ color: "var(--danger)" }}>{error ?? "No data."}</p>
        <Button size="sm" variant="outline" onClick={() => void load()}>
          Retry
        </Button>
      </section>
    );
  }

  if (!data) {
    return null;
  }

  const { stats, permissions, commandKpis } = data;
  const overdueInvCount = data.overdueInvoices?.length ?? 0;
  const deadlinesDue =
    data.calendarReminders?.counts.dueSoon ??
    data.dueSoonProcedures.length + data.overdueProcedures.length;
  const trustOk =
    !permissions.trust ||
    !data.trustAttention ||
    data.trustAttention.attentionCount === 0;

  const donutSlices = [
    "open",
    "prospective",
    "on_hold",
    "closed",
    "archived",
  ]
    .map((key) => ({
      key,
      label: STATUS_LABELS[key] ?? key,
      value: data.statusMix.byStatus[key] ?? 0,
      color: STATUS_COLORS[key] ?? "#737A88",
    }))
    .filter((s) => s.value > 0);

  const diaryItems: ReminderItem[] = [];
  if (data.calendarReminders) {
    diaryItems.push(
      ...data.calendarReminders.hearings,
      ...data.calendarReminders.overdue,
      ...data.calendarReminders.dueSoon,
    );
  } else {
    for (const h of data.upcomingHearings) {
      diaryItems.push({
        id: h.id,
        kind: "hearing",
        title: h.title,
        dueAt: h.nextHearingAt,
        matterId: h.id,
        matterTitle: h.clientDisplayName,
        href: `/matters/${h.id}`,
        isOverdue: false,
      });
    }
    for (const p of data.overdueProcedures) {
      diaryItems.push({
        id: p.id,
        kind: "deadline",
        title: p.title,
        dueAt: p.dueAt ?? "",
        matterId: p.matterId,
        matterTitle: p.matterTitle,
        href: `/matters/${p.matterId}`,
        isOverdue: true,
      });
    }
    for (const p of data.dueSoonProcedures) {
      diaryItems.push({
        id: p.id,
        kind: "deadline",
        title: p.title,
        dueAt: p.dueAt ?? "",
        matterId: p.matterId,
        matterTitle: p.matterTitle,
        href: `/matters/${p.matterId}`,
        isOverdue: false,
      });
    }
  }
  const diary = diaryItems.slice(0, 6);

  const feeBars =
    data.feeRevenue?.map((m) => ({
      key: m.key,
      label: m.label,
      value: m.totalCents / 100,
    })) ?? [];

  const feeCurrency = data.feeRevenue?.[0]?.currency ?? "USD";

  return (
    <section
      className="view active scrollable dash-command"
      aria-label="Dashboard"
      id="view-dashboard"
    >
      <div className="dash-hero">
        <div className="dash-greeting">
          <h2>
            {greeting}, {roleLabel}
          </h2>
          <p>
            {dateLine} · {firmLabel}
            {data.viewAll ? " · firm-wide" : " · your matters"}
          </p>
        </div>
        <div className="dash-hero-actions">
          <Link href="/ai" className="ai-launch">
            <div className="ai-launch-icon">
              <Icon name="robot" />
            </div>
            <div className="ai-launch-text">
              <strong>AI Assistant</strong>
              <em>Ask · Research · Draft</em>
            </div>
          </Link>
        </div>
      </div>

      <div className="alert-pills">
        {permissions.calendar ? (
          <Link
            href="/calendar"
            className={`alert-pill ${commandKpis.hearingsThisWeek ? "crit" : "ok"}`}
          >
            <Icon name="calendar" />
            {commandKpis.hearingsThisWeek} hearings this week
          </Link>
        ) : null}
        {permissions.billing ? (
          <Link
            href="/billing"
            className={`alert-pill ${overdueInvCount ? "crit" : "ok"}`}
          >
            <Icon name="invoice" />
            {overdueInvCount} overdue fee note{overdueInvCount === 1 ? "" : "s"}
          </Link>
        ) : null}
        <Link
          href="/reminders"
          className={`alert-pill ${deadlinesDue ? "warn" : "ok"}`}
        >
          <Icon name="bell" />
          {deadlinesDue} deadlines due
        </Link>
        {permissions.trust ? (
          <Link
            href="/trust"
            className={`alert-pill ${trustOk ? "ok" : "crit"}`}
          >
            <Icon name="shield" />
            {trustOk
              ? "Trust ledger balanced"
              : `${data.trustAttention?.attentionCount ?? 0} trust attention`}
          </Link>
        ) : null}
      </div>

      <OnboardingChecklist />

      {data.financeKpis ? (
        <FinanceKpisPanel kpis={data.financeKpis} compact />
      ) : null}

      <div className="stats-grid dash-kpi-row">
        <KpiCard
          href="/clients"
          icon="users"
          label="Active clients"
          value={commandKpis.activeClients}
          hint={`+${commandKpis.newClientsThisMonth} this month`}
          delay={0}
        />
        <KpiCard
          href="/matters?bucket=open"
          icon="briefcase"
          label="Open matters"
          value={stats.openMatters}
          hint={`${commandKpis.highPriorityOpen} high priority`}
          delay={1}
        />
        <KpiCard
          href="/calendar"
          icon="calendar"
          label="Pending hearings"
          value={commandKpis.hearingsThisWeek}
          hint={
            commandKpis.nextHearingAt
              ? `Next: ${formatShortDate(commandKpis.nextHearingAt)}`
              : "None scheduled"
          }
          delay={2}
        />
        {permissions.billing ? (
          <KpiCard
            href="/billing"
            icon="invoice"
            label="Outstanding fees"
            value={centsToDisplay(
              commandKpis.outstandingFeesCents,
              commandKpis.outstandingCurrency,
            )}
            hint={`${overdueInvCount} overdue`}
            delay={3}
          />
        ) : (
          <KpiCard
            href="/matters?bucket=closed"
            icon="folder"
            label="Closed matters"
            value={stats.closedMatters}
            hint="Closed or archived"
            delay={3}
          />
        )}
        <KpiCard
          href="/reminders"
          icon="clipboard"
          label="Upcoming deadlines"
          value={
            (data.calendarReminders?.counts.total ??
              data.dueSoonProcedures.length + data.overdueProcedures.length) ||
            stats.overdueProcedures
          }
          hint={`${stats.overdueProcedures} overdue procedures`}
          delay={4}
        />
      </div>

      <div className="dash-body">
        <div className="panel dash-chart-panel">
          <div className="panel-head">
            <h3>Case distribution</h3>
            <span className="muted">Matter status mix</span>
          </div>
          <div className="panel-body">
            {donutSlices.length === 0 ? (
              <p className="muted">No matters yet.</p>
            ) : (
              <AnimatedDonutChart slices={donutSlices} totalLabel="total" />
            )}
          </div>
        </div>

        <div className="panel dash-chart-panel">
          <div className="panel-head">
            <h3>Fee revenue</h3>
            <span className="muted">Last 6 months</span>
          </div>
          <div className="panel-body">
            {!permissions.billing || !data.feeRevenue ? (
              <p className="muted">Billing charts require billing access.</p>
            ) : feeBars.every((b) => b.value === 0) ? (
              <p className="muted">No fee payments recorded in this period.</p>
            ) : (
              <AnimatedBarChart
                bars={feeBars}
                formatValue={(n) =>
                  n >= 1000 ? `$${(n / 1000).toFixed(0)}k` : `$${Math.round(n)}`
                }
              />
            )}
            {permissions.billing ? (
              <p className="muted" style={{ marginTop: "0.5rem", fontSize: "0.72rem" }}>
                Collected fees ({feeCurrency})
              </p>
            ) : null}
          </div>
        </div>

        <div className="dash-side-stack">
          <div className="panel">
            <div className="panel-head">
              <h3>Upcoming diary</h3>
              <Link href="/reminders" className="btn btn-ghost btn-sm">
                All
              </Link>
            </div>
            <div className="panel-body">
              {diary.length === 0 ? (
                <p className="muted">Nothing upcoming.</p>
              ) : (
                <ul className="dash-feed">
                  {diary.map((item) => (
                    <li key={`${item.kind}-${item.id}`}>
                      <Link href={item.href}>
                        <strong>{item.title}</strong>
                        <span>
                          <em className={item.isOverdue ? "tone-danger" : ""}>
                            {item.kind}
                          </em>
                          {" · "}
                          {formatShortDate(item.dueAt)}
                          {item.matterTitle ? ` · ${item.matterTitle}` : ""}
                        </span>
                      </Link>
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
                <ul className="dash-feed">
                  {data.recentActivity.slice(0, 5).map((a) => (
                    <li key={a.id}>
                      <Link href={`/matters/${a.matterId}`}>
                        <strong>{a.title}</strong>
                        <span>
                          {a.createdByName ? `${a.createdByName} · ` : ""}
                          {a.matterTitle} · {formatDateTime(a.eventAt)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="dash-foot">
        <Button size="sm" variant="outline" onClick={() => void load()}>
          Refresh
        </Button>
      </div>
    </section>
  );
}
