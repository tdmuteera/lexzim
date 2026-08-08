import { jsonError, jsonOk } from "@/lib/auth/http";
import {
  getDashboardStats,
  listDashboardOpenIntakes,
  listDashboardOverdueInvoices,
  listDashboardProcedures,
  listDashboardTrustAttention,
  listRecentActivity,
  listUpcomingHearings,
  listWorkloadByLawyer,
} from "@/lib/repos/dashboard";
import { getReminders } from "@/lib/repos/reminders";
import {
  canViewAllMatters,
  hasPermission,
  requirePermission,
} from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

export async function GET() {
  try {
    const session = await requirePermission("dashboard.view");
    const firmId = tenantFirmId(session);
    const viewAll = canViewAllMatters(session);
    const isManagingPartner = session.role.code === "managing_partner";

    const canCalendar = hasPermission(session, "calendar.view");
    const canBilling = hasPermission(session, "billing.view");
    const canTrust = hasPermission(session, "trust.view");
    const canIntake = hasPermission(session, "intake.view");

    const [stats, overdueProcedures, dueSoonProcedures, upcomingHearings, recentActivity] =
      await Promise.all([
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
      ]);

    const workloadByLawyer = isManagingPartner
      ? await listWorkloadByLawyer(firmId)
      : [];

    // Role-aware slices: omit (null) when permission missing — never leak money/intake data.
    const [calendarReminders, overdueInvoices, trustAttention, openIntakes] =
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
        canIntake ? listDashboardOpenIntakes(firmId, 8) : Promise.resolve(null),
      ]);

    return jsonOk({
      viewAll,
      isManagingPartner,
      firmName: session.firm.name,
      permissions: {
        calendar: canCalendar,
        billing: canBilling,
        trust: canTrust,
        intake: canIntake,
      },
      stats,
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
      openIntakes,
      labels: {
        billing: "Billing (fees)",
        trust: "Trust (client money)",
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
