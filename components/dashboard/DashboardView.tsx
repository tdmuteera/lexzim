"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  AnimatedBarChart,
  AnimatedDonutChart,
} from "@/components/dashboard/DashboardCharts";
import { FinanceKpisPanel } from "@/components/finance/FinanceKpisPanel";
import { OnboardingChecklist } from "@/components/onboarding/OnboardingChecklist";
import { Icon } from "@/components/ui/Icon";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Button } from "@/components/ui/Button";
import { centsToDisplay } from "@/lib/billing/money";
import { getModuleCache, setModuleCache } from "@/lib/client/module-cache";
import { diagnosticJson } from "@/lib/diagnostics/client";
import { formatDateTime } from "@/lib/format/dates";
import type { FinanceKpis } from "@/lib/repos/finance-kpis";
import type { NavIcon } from "@/lib/nav";
import { firstNameFromFullName } from "@/lib/utils/name";
import { UiAnomalyProbe } from "@/components/diagnostics/UiAnomalyProbe";

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
  jobTitle?: string | null;
  permissions: {
    clients: boolean;
    matters: boolean;
    calendar: boolean;
    billing: boolean;
    trust: boolean;
    reports: boolean;
    finance: boolean;
    ai: boolean;
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
    proformaFirmFeesCents?: number;
    proformaCollectibleCents?: number;
    proformaCurrency?: string;
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
  upcomingMeetings: Array<{
    id: string;
    title: string;
    startsAt: string;
    location: string | null;
    clientDisplayName: string | null;
    clientNumber: string | null;
    matterTitle: string | null;
    matterNumber: string | null;
    matterId: string | null;
    clientId: string | null;
    href: string;
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
  pendingTasks?: {
    count: number;
    overdue: number;
  } | null;
  lawyerPerformance: {
    viewAll: boolean;
    canViewRevenue: boolean;
    from: string;
    to: string;
    currency: string;
    attributionPolicy: string;
    rows: Array<{
      lawyerId: string | null;
      lawyerName: string;
      openMatters: number;
      collectedCents: number;
    }>;
    totals: { openMatters: number; collectedCents: number };
    glCheck: {
      feePaymentsTotalCents: number;
      glRevenueCents: number;
      varianceCents: number;
      mismatch: boolean;
      note: string;
    } | null;
  } | null;
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

function chartPersonLabel(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return name;
  return `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`;
}

function KpiCard({
  href,
  icon,
  label,
  value,
  hint,
  delay,
  format,
}: {
  href?: string;
  icon: NavIcon;
  label: string;
  value: number;
  hint: string;
  delay: number;
  format?: (n: number) => string;
}) {
  const inner = (
    <>
      <div className="stat-icon">
        <Icon name={icon} />
      </div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">
        <AnimatedNumber value={value} durationMs={700 + delay * 90} format={format} />
      </div>
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
  const [errorRef, setErrorRef] = useState<string | null>(null);

  const load = useCallback(async (opts?: { background?: boolean }) => {
    const background = Boolean(opts?.background);
    if (!background) setLoading(true);
    setError(null);
    setErrorRef(null);
    try {
      const result = await diagnosticJson<DashboardData>("/api/dashboard");
      if (!result.ok || !result.data) {
        if (!background) {
          setError(result.error?.message ?? "Could not load dashboard.");
          setErrorRef(result.requestId);
          setData(null);
        }
        return;
      }
      setModuleCache(DASHBOARD_CACHE_KEY, result.data);
      setData(result.data);
    } catch {
      if (!background) {
        setError("Could not load dashboard.");
        setErrorRef(null);
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

  const greetingName = firstNameFromFullName(user?.fullName);
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
              {greeting}, {greetingName}
            </h2>
            <p>
              {dateLine} · {firmLabel}
            </p>
          </div>
          <div className="dash-hero-actions">
            {user?.permissions?.includes("ai.use") ? (
              <Link href="/ai" className="ai-launch">
                <div className="ai-launch-icon">
                  <Icon name="robot" />
                </div>
                <div className="ai-launch-text">
                  <strong>AI Assistant</strong>
                  <em>Ask · Research · Draft</em>
                </div>
              </Link>
            ) : null}
          </div>
        </div>

        <div className="alert-pills">
          <span className="alert-pill ok">
            <Icon name="briefcase" /> Loading your workspace…
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
        </div>
      </section>
    );
  }

  if ((error || !data) && !loading) {
    return (
      <section className="view active scrollable" aria-label="Dashboard">
        <p style={{ color: "var(--danger)" }}>{error ?? "No data."}</p>
        {errorRef ? (
          <p className="muted" style={{ fontSize: "0.78rem", wordBreak: "break-all" }}>
            Reference: {errorRef}
          </p>
        ) : null}
        <Button size="sm" variant="outline" onClick={() => void load()}>
          Retry
        </Button>
      </section>
    );
  }

  if (!data) {
    return null;
  }

  const { stats, commandKpis } = data;
  const permissionDefaults = {
    clients: false,
    matters: false,
    calendar: false,
    billing: false,
    trust: false,
    reports: false,
    finance: false,
    ai: false,
  };
  const permissions = { ...permissionDefaults, ...data.permissions };
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
      ...data.calendarReminders.meetings,
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
  const lp = data.lawyerPerformance;
  const caseloadBars =
    lp?.rows.map((r) => ({
      key: r.lawyerId ?? "unassigned",
      label: chartPersonLabel(r.lawyerName),
      title: r.lawyerName,
      value: r.openMatters,
    })) ?? [];
  const lawyerRevenueBars =
    lp?.rows.map((r) => ({
      key: r.lawyerId ?? "unassigned",
      label: chartPersonLabel(r.lawyerName),
      title: r.lawyerName,
      value: r.collectedCents / 100,
    })) ?? [];
  const lawyerCurrency = lp?.currency ?? feeCurrency;

  return (
    <section
      className="view active scrollable dash-command"
      aria-label="Dashboard"
      id="view-dashboard"
    >
      <UiAnomalyProbe scope="dashboard" />
      <div className="dash-hero motion-hero">
        <div className="dash-greeting">
          <h2>
            {greeting}, {greetingName}
          </h2>
          <p>
            {dateLine} · {firmLabel}
            {data.viewAll ? " · firm-wide" : " · your matters"}
          </p>
        </div>
        <div className="dash-hero-actions">
          {permissions.ai ? (
            <Link href="/ai" className="ai-launch">
              <div className="ai-launch-icon">
                <Icon name="robot" />
              </div>
              <div className="ai-launch-text">
                <strong>AI Assistant</strong>
                <em>Ask · Research · Draft</em>
              </div>
            </Link>
          ) : null}
        </div>
      </div>

      <div className="alert-pills motion-pills">
        {permissions.calendar ? (
          <Link
            href="/calendar"
            className={`alert-pill ${commandKpis.hearingsThisWeek ? "crit" : "ok"}`}
          >
            <Icon name="calendar" />
            <AnimatedNumber value={commandKpis.hearingsThisWeek} durationMs={700} /> hearings
            this week
          </Link>
        ) : null}
        {permissions.billing ? (
          <Link
            href="/billing"
            className={`alert-pill ${overdueInvCount ? "crit" : "ok"}`}
          >
            <Icon name="invoice" />
            <AnimatedNumber value={overdueInvCount} durationMs={750} /> overdue fee note
            {overdueInvCount === 1 ? "" : "s"}
          </Link>
        ) : null}
        {permissions.calendar || permissions.matters ? (
          <Link
            href={permissions.calendar ? "/reminders" : "/matters"}
            className={`alert-pill ${deadlinesDue ? "warn" : "ok"}`}
          >
            <Icon name="bell" />
            <AnimatedNumber value={deadlinesDue} durationMs={800} /> deadlines due
          </Link>
        ) : null}
        {permissions.trust ? (
          <Link
            href="/trust"
            className={`alert-pill ${trustOk ? "ok" : "crit"}`}
          >
            <Icon name="shield" />
            {trustOk
              ? "Trust ledger balanced"
              : (
                <>
                  <AnimatedNumber
                    value={data.trustAttention?.attentionCount ?? 0}
                    durationMs={800}
                  />{" "}
                  trust attention
                </>
              )}
          </Link>
        ) : null}
      </div>

      <OnboardingChecklist />

      {data.financeKpis && permissions.finance ? (
        <FinanceKpisPanel kpis={data.financeKpis} compact />
      ) : null}

      <div className="stats-grid dash-kpi-row motion-kpis">
        {(data.pendingTasks?.count ?? 0) > 0 ? (
          <KpiCard
            href="/workflow/tasks"
            icon="clipboard"
            label="Pending tasks"
            value={data.pendingTasks!.count}
            hint={
              data.pendingTasks!.overdue > 0
                ? `${data.pendingTasks!.overdue} overdue`
                : "Assigned to you"
            }
            delay={0}
          />
        ) : null}
        {permissions.clients ? (
          <KpiCard
            href="/clients"
            icon="users"
            label="Active clients"
            value={commandKpis.activeClients}
            hint={`+${commandKpis.newClientsThisMonth} this month`}
            delay={0}
          />
        ) : null}
        {permissions.matters ? (
          <KpiCard
            href="/matters?bucket=open"
            icon="briefcase"
            label="Open matters"
            value={stats.openMatters}
            hint={`${commandKpis.highPriorityOpen} high priority`}
            delay={1}
          />
        ) : null}
        {permissions.calendar ? (
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
        ) : null}
        {permissions.billing ? (
          <KpiCard
            href="/billing"
            icon="invoice"
            label="Outstanding fees"
            value={commandKpis.outstandingFeesCents}
            format={(n) => centsToDisplay(n, commandKpis.outstandingCurrency)}
            hint={`${overdueInvCount} overdue · invoice AR only`}
            delay={3}
          />
        ) : permissions.matters ? (
          <KpiCard
            href="/matters?bucket=closed"
            icon="folder"
            label="Closed matters"
            value={stats.closedMatters}
            hint="Closed or archived"
            delay={3}
          />
        ) : null}
        {permissions.billing || permissions.finance ? (
          <KpiCard
            href="/finance/proforma"
            icon="invoice"
            label="Pro forma firm fees"
            value={commandKpis.proformaFirmFeesCents ?? 0}
            format={(n) =>
              centsToDisplay(n, commandKpis.proformaCurrency || commandKpis.outstandingCurrency)
            }
            hint="Expected firm earnings (pipeline)"
            delay={4}
          />
        ) : null}
        {permissions.billing || permissions.finance ? (
          <KpiCard
            href="/finance/proforma"
            icon="invoice"
            label="Pro forma collectibles"
            value={commandKpis.proformaCollectibleCents ?? 0}
            format={(n) =>
              centsToDisplay(n, commandKpis.proformaCurrency || commandKpis.outstandingCurrency)
            }
            hint="To collect and pay onward"
            delay={5}
          />
        ) : null}
        {permissions.calendar || permissions.matters ? (
          <KpiCard
            href={permissions.calendar ? "/reminders" : "/matters"}
            icon="clipboard"
            label="Upcoming deadlines"
            value={
              (data.calendarReminders?.counts.total ??
                data.dueSoonProcedures.length + data.overdueProcedures.length) ||
              stats.overdueProcedures
            }
            hint={`${stats.overdueProcedures} overdue procedures`}
            delay={6}
          />
        ) : null}
      </div>

      {permissions.matters || permissions.billing || permissions.finance ? (
        <div className="dash-body dash-charts motion-charts">
          {permissions.matters ? (
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
          ) : null}

          {permissions.billing || permissions.finance ? (
            <div className="panel dash-chart-panel">
              <div className="panel-head">
                <h3>Fee revenue</h3>
                <span className="muted">Last 6 months</span>
              </div>
              <div className="panel-body">
                {!data.feeRevenue || feeBars.every((b) => b.value === 0) ? (
                  <p className="muted">No fee payments recorded in this period.</p>
                ) : (
                  <AnimatedBarChart
                    bars={feeBars}
                    formatValue={(n) =>
                      n >= 1000 ? `$${(n / 1000).toFixed(0)}k` : `$${Math.round(n)}`
                    }
                  />
                )}
                <p className="muted dash-chart-caption">
                  Collected fees ({feeCurrency})
                </p>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {permissions.calendar ? (
        <div className="dash-body dash-lists motion-lists">
          <div className="panel">
            <div className="panel-head">
              <h3>Upcoming meetings</h3>
              <Link href="/calendar" className="btn btn-ghost btn-sm">
                Calendar
              </Link>
            </div>
            <div className="panel-body">
              {data.upcomingMeetings.length === 0 ? (
                <p className="muted">No client meetings scheduled.</p>
              ) : (
                <ul className="dash-feed">
                  {data.upcomingMeetings.slice(0, 6).map((m) => (
                    <li key={m.id}>
                      <Link href={m.href}>
                        <strong>{m.title}</strong>
                        <span>
                          {formatShortDate(m.startsAt)}
                          {m.clientDisplayName ? ` · ${m.clientDisplayName}` : ""}
                          {m.matterTitle
                            ? ` · ${m.matterNumber ? `${m.matterNumber} · ` : ""}${m.matterTitle}`
                            : ""}
                          {m.location ? ` · ${m.location}` : ""}
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
              <h3>Upcoming hearings</h3>
              <Link href="/calendar" className="btn btn-ghost btn-sm">
                Calendar
              </Link>
            </div>
            <div className="panel-body">
              {data.upcomingHearings.length === 0 ? (
                <p className="muted">No hearings on the diary.</p>
              ) : (
                <ul className="dash-feed">
                  {data.upcomingHearings.slice(0, 6).map((h) => (
                    <li key={h.id}>
                      <Link href={`/matters/${h.id}`}>
                        <strong>{h.title}</strong>
                        <span>
                          {formatShortDate(h.nextHearingAt)}
                          {h.clientDisplayName ? ` · ${h.clientDisplayName}` : ""}
                          {h.courtName ? ` · ${h.courtName}` : ""}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {permissions.matters || permissions.calendar ? (
        <div className="dash-body dash-lists motion-lists">
          <div className="panel">
            <div className="panel-head">
              <h3>Upcoming diary</h3>
              <Link
                href={permissions.calendar ? "/reminders" : "/matters"}
                className="btn btn-ghost btn-sm"
              >
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

          {permissions.matters ? (
            <div className="panel">
              <div className="panel-head">
                <h3>Recent activity</h3>
              </div>
              <div className="panel-body">
                {data.recentActivity.length === 0 ? (
                  <p className="muted">No recent timeline activity.</p>
                ) : (
                  <ul className="dash-feed">
                    {data.recentActivity.slice(0, 6).map((a) => (
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
          ) : null}
        </div>
      ) : null}

      {lp && (permissions.matters || permissions.finance) ? (
        <div className="dash-body dash-charts motion-charts">
          {permissions.matters ? (
            <div className="panel dash-chart-panel">
              <div className="panel-head">
                <h3>Caseload by lawyer</h3>
                <span className="muted">
                  {lp.viewAll ? "Open matters" : "Your open matters"} ·{" "}
                  <AnimatedNumber value={lp.totals.openMatters} durationMs={900} />
                </span>
              </div>
              <div className="panel-body">
                {caseloadBars.length === 0 || caseloadBars.every((b) => b.value === 0) ? (
                  <p className="muted">No open matters in this scope.</p>
                ) : (
                  <AnimatedBarChart bars={caseloadBars} formatValue={(n) => String(Math.round(n))} />
                )}
              </div>
            </div>
          ) : null}

          {permissions.finance && lp.canViewRevenue ? (
            <div className="panel dash-chart-panel">
              <div className="panel-head">
                <h3>Revenue by lawyer</h3>
                {permissions.reports ? (
                  <Link href="/reports/lawyer-performance" className="btn btn-ghost btn-sm">
                    Full report
                  </Link>
                ) : (
                  <span className="muted">Last 6 months</span>
                )}
              </div>
              <div className="panel-body">
                {lawyerRevenueBars.every((b) => b.value === 0) ? (
                  <p className="muted">No fee receipts in the last 6 months.</p>
                ) : (
                  <AnimatedBarChart
                    bars={lawyerRevenueBars}
                    formatValue={(n) =>
                      n >= 1000
                        ? `${(n / 1000).toFixed(0)}k`
                        : centsToDisplay(Math.round(n * 100), lawyerCurrency)
                    }
                  />
                )}
                <p className="muted dash-chart-caption">
                  Collected fees ({lawyerCurrency}) by responsible lawyer. Cash basis.
                  {lp.glCheck?.mismatch
                    ? ` GL revenue differs by ${centsToDisplay(lp.glCheck.varianceCents, lawyerCurrency)}.`
                    : ""}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="dash-foot">
        <Button size="sm" variant="outline" onClick={() => void load()}>
          Refresh
        </Button>
      </div>
    </section>
  );
}
