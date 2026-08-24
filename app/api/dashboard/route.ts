import { jsonError, jsonOk } from "@/lib/auth/http";
import {
  getDashboardCommandKpis,
  getDashboardFeeRevenueByMonth,
  getDashboardMatterStatusMix,
} from "@/lib/repos/dashboard-charts";
import {
  getDashboardStats,
  listDashboardOverdueInvoices,
  listDashboardProcedures,
  listDashboardTrustAttention,
  listRecentActivity,
  listUpcomingHearings,
  listUpcomingMeetings,
} from "@/lib/repos/dashboard";
import {
  buildLawyerPerformance,
  lastMonthsRange,
} from "@/lib/repos/lawyer-performance";
import { syncMeetingRemindersForFirm } from "@/lib/calendar/meeting-notifications";
import { getFinanceKpis } from "@/lib/repos/finance-kpis";
import { getReminders } from "@/lib/repos/reminders";
import {
  canViewAllLawyerPerformance,
  canViewAllMatters,
  canViewFirmRevenue,
  hasPermission,
  requirePermission,
} from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";
import { prepareDbRetry } from "@/lib/db";

export async function GET(request: Request) {
  try {
    prepareDbRetry();
    const session = await requirePermission("dashboard.view");
    const firmId = tenantFirmId(session);
    const viewAll = canViewAllMatters(session);
    const isManagingPartner = session.role.code === "managing_partner";

    const canClients = hasPermission(session, "clients.view");
    const canMatters = hasPermission(session, "matters.view");
    const canCalendar = hasPermission(session, "calendar.view");
    const canBilling = hasPermission(session, "billing.view");
    const canTrust = hasPermission(session, "trust.view");
    const canReports = hasPermission(session, "reports.view");
    const canFinance = hasPermission(session, "finance.view");
    const canAi = hasPermission(session, "ai.use");
    /** Revenue by lawyer / firm money charts: finance desk only. */
    const canViewRevenue = canViewFirmRevenue(session);
    const canFinanceKpis = canFinance;
    const lawyerViewAll = canViewAllLawyerPerformance(session);
    const currency = session.firm.defaultCurrency || "USD";
    const lawyerRange = lastMonthsRange(6);

    const meetingLimit = isManagingPartner ? 10 : 5;
    const hearingLimit = isManagingPartner ? 10 : 5;

    const [
      stats,
      overdueProcedures,
      dueSoonProcedures,
      upcomingHearings,
      upcomingMeetings,
      recentActivity,
      statusMix,
      commandKpis,
    ] = await Promise.all([
      canMatters
        ? getDashboardStats({ firmId, userId: session.id, viewAll })
        : Promise.resolve({
            openMatters: 0,
            closedMatters: 0,
            newClientsThisMonth: 0,
            overdueProcedures: 0,
          }),
      canMatters
        ? listDashboardProcedures({
            firmId,
            userId: session.id,
            viewAll,
            mode: "overdue",
            limit: 8,
          })
        : Promise.resolve([]),
      canMatters
        ? listDashboardProcedures({
            firmId,
            userId: session.id,
            viewAll,
            mode: "due_soon",
            limit: 8,
          })
        : Promise.resolve([]),
      canCalendar
        ? listUpcomingHearings({
            firmId,
            userId: session.id,
            viewAll,
            limit: hearingLimit,
          })
        : Promise.resolve([]),
      canCalendar
        ? listUpcomingMeetings({
            firmId,
            userId: session.id,
            viewAll,
            limit: meetingLimit,
          })
        : Promise.resolve([]),
      canMatters
        ? listRecentActivity({
            firmId,
            userId: session.id,
            viewAll,
            limit: 10,
          })
        : Promise.resolve([]),
      canMatters
        ? getDashboardMatterStatusMix({ firmId, userId: session.id, viewAll })
        : Promise.resolve({ byStatus: {}, total: 0 }),
      getDashboardCommandKpis({ firmId, userId: session.id, viewAll }),
    ]);

    if (canCalendar) {
      void syncMeetingRemindersForFirm(firmId).catch(() => undefined);
    }

    const lawyerPerformance =
      canMatters || canViewRevenue
        ? await buildLawyerPerformance({
            firmId,
            from: lawyerRange.from,
            to: lawyerRange.to,
            currency,
            viewAll: lawyerViewAll,
            lawyerId: session.id,
            includeGlCheck:
              canViewRevenue && hasPermission(session, "finance.gl.view"),
          })
        : null;

    const financeKpis = canFinanceKpis
      ? await getFinanceKpis(firmId, {
          userId: session.id,
          viewAll,
          defaultCurrency: session.firm.defaultCurrency || "USD",
        }).catch(() => null)
      : null;

    const [calendarReminders, overdueInvoices, trustAttention, feeRevenue] =
      await Promise.all([
        canCalendar
          ? getReminders({
              firmId,
              userId: session.id,
              viewAll,
              dueSoonDays: 7,
              limitPerBucket: 8,
            })
          : Promise.resolve(null),
        canBilling
          ? listDashboardOverdueInvoices(firmId, { limit: 8 })
          : Promise.resolve(null),
        canTrust ? listDashboardTrustAttention(firmId) : Promise.resolve(null),
        canBilling || canViewRevenue
          ? getDashboardFeeRevenueByMonth(firmId, 6)
          : Promise.resolve(null),
      ]);

    return jsonOk({
      viewAll,
      isManagingPartner,
      firmName: session.firm.name,
      roleName: session.role.name,
      jobTitle: session.jobTitle ?? null,
      permissions: {
        clients: canClients,
        matters: canMatters,
        calendar: canCalendar,
        billing: canBilling,
        trust: canTrust,
        reports: canReports,
        finance: canFinance,
        ai: canAi,
      },
      stats,
      commandKpis: {
        ...commandKpis,
        activeClients: canClients ? commandKpis.activeClients : 0,
        newClientsThisMonth: canClients ? commandKpis.newClientsThisMonth : 0,
        outstandingFeesCents: canBilling ? commandKpis.outstandingFeesCents : 0,
        hearingsThisWeek: canCalendar ? commandKpis.hearingsThisWeek : 0,
        nextHearingAt: canCalendar ? commandKpis.nextHearingAt : null,
      },
      statusMix,
      feeRevenue: canBilling || canViewRevenue ? feeRevenue : null,
      overdueProcedures: canMatters ? overdueProcedures : [],
      dueSoonProcedures: canMatters ? dueSoonProcedures : [],
      upcomingHearings,
      upcomingMeetings,
      recentActivity,
      lawyerPerformance: lawyerPerformance
        ? {
            viewAll: lawyerPerformance.viewAll,
            canViewRevenue,
            from: lawyerPerformance.from,
            to: lawyerPerformance.to,
            currency: lawyerPerformance.currency,
            attributionPolicy: lawyerPerformance.attributionPolicy,
            rows: canViewRevenue
              ? lawyerPerformance.rows
              : lawyerPerformance.rows.map((r) => ({ ...r, collectedCents: 0 })),
            totals: {
              openMatters: lawyerPerformance.totals.openMatters,
              collectedCents: canViewRevenue
                ? lawyerPerformance.totals.collectedCents
                : 0,
            },
            glCheck: canViewRevenue ? lawyerPerformance.glCheck : null,
          }
        : null,
      calendarReminders: calendarReminders
        ? {
            counts: calendarReminders.counts,
            overdue: calendarReminders.overdue.slice(0, 8),
            dueSoon: calendarReminders.dueSoon.slice(0, 8),
            hearings: calendarReminders.hearings.slice(0, 8),
            meetings: calendarReminders.meetings.slice(0, 8),
          }
        : null,
      overdueInvoices,
      trustAttention,
      financeKpis,
      labels: { billing: "Fee notes", trust: "Trust" },
    });
  } catch (err) {
    return jsonError(err, request);
  }
}
