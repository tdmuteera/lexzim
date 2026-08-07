import { jsonError, jsonOk } from "@/lib/auth/http";
import {
  getDashboardStats,
  listDashboardProcedures,
  listRecentActivity,
  listUpcomingHearings,
  listWorkloadByLawyer,
} from "@/lib/repos/dashboard";
import { canViewAllMatters, requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

export async function GET() {
  try {
    const session = await requirePermission("dashboard.view");
    const firmId = tenantFirmId(session);
    const viewAll = canViewAllMatters(session);
    const isManagingPartner = session.role.code === "managing_partner";

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

    return jsonOk({
      viewAll,
      isManagingPartner,
      firmName: session.firm.name,
      stats,
      overdueProcedures,
      dueSoonProcedures,
      upcomingHearings,
      recentActivity,
      workloadByLawyer,
    });
  } catch (err) {
    return jsonError(err);
  }
}
