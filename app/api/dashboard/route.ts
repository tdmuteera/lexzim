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
  listWorkloadByLawyer,
} from "@/lib/repos/dashboard";
import { getFinanceKpis } from "@/lib/repos/finance-kpis";
import { getReminders } from "@/lib/repos/reminders";
import {
  canViewAllMatters,
  hasPermission,
  requirePermission,
} from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";
import { prepareDbRetry } from "@/lib/db";

export async function GET() {
  try {
    // Dashboard is high-traffic; clear stale cooldown before probing DB.
    prepareDbRetry();
    const session = await requirePermission("dashboard.view");
    const firmId = tenantFirmId(session);
    const viewAll = canViewAllMatters(session);
    const isManagingPartner = session.role.code === "managing_partner";

    const canCalendar = hasPermission(session, "calendar.view");
    const canBilling = hasPermission(session, "billing.view");
    const canTrust = hasPermission(session, "trust.view");
    const canFinanceKpis = isManagingPartner && hasPermission(session, "finance.view");

    const [
      stats,
      overdueProcedures,
      dueSoonProcedures,
      upcomingHearings,
      recentActivity,
      statusMix,
      commandKpis,
    ] = await Promise.all([
      getDashboardStats({ firmId, userId: session.id, viewAll }),
      listDashboardProcedures({
        firmId,
        userId: session.id,
        viewAll,
        mode: "overdue",
        limit: 8,
      }),
      listDashboardProcedures({
        firmId,
        userId: session.id,
        viewAll,
        mode: "due_soon",
        limit: 8,
      }),
      listUpcomingHearings({
        firmId,
        userId: session.id,
        viewAll,
        limit: 8,
      }),
      listRecentActivity({
        firmId,
        userId: session.id,
        viewAll,
        limit: 10,
      }),
      getDashboardMatterStatusMix({ firmId, userId: session.id, viewAll }),
      getDashboardCommandKpis({ firmId, userId: session.id, viewAll }),
    ]);

    const workloadByLawyer = isManagingPartner
      ? await listWorkloadByLawyer(firmId)
      : [];

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
        canBilling
          ? getDashboardFeeRevenueByMonth(firmId, 6)
          : Promise.resolve(null),
      ]);

    return jsonOk({
      viewAll,
      isManagingPartner,
      firmName: session.firm.name,
      roleName: session.role.name,
      permissions: {
        calendar: canCalendar,
        billing: canBilling,
        trust: canTrust,
      },
      stats,
      commandKpis,
      statusMix,
      feeRevenue,
      overdueProcedures,
      dueSoonProcedures,
      upcomingHearings,
      recentActivity,
      workloadByLawyer,
      calendarReminders: calendarReminders
        ? {
            counts: calendarReminders.counts,
            overdue: calendarReminders.overdue.slice(0, 8),
            dueSoon: calendarReminders.dueSoon.slice(0, 8),
            hearings: calendarReminders.hearings.slice(0, 8),
          }
        : null,
      overdueInvoices,
      trustAttention,
      financeKpis,
      labels: {
        billing: "Billing (fees)",
        trust: "Trust (client money)",
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
