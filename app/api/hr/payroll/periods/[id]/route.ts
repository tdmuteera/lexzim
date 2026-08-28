import { jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { getPayrollPeriodWithLines } from "@/lib/repos/hr-payroll";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/hr/payroll/periods/[id]
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("hr.view");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const data = await getPayrollPeriodWithLines(firmId, id);
    if (!data) {
      throw new AuthError("not_found", "Payroll period not found.");
    }
    return jsonOk({
      period: {
        id: data.period.id,
        label: data.period.label,
        periodStart: data.period.periodStart.toISOString(),
        periodEnd: data.period.periodEnd.toISOString(),
        status: data.period.status,
        createdBy: data.period.createdBy,
        createdAt: data.period.createdAt.toISOString(),
      },
      lines: data.lines.map((r) => ({
        id: r.line.id,
        staffProfileId: r.line.staffProfileId,
        staffName: r.staffName,
        employeeNumber: r.employeeNumber,
        grossCents: r.line.grossCents,
        advancesOutstandingCents: r.line.advancesOutstandingCents,
        deductionsCents: r.line.deductionsCents,
        netPayableCents: r.line.netPayableCents,
        advanceIds: r.line.advanceIdsJson,
        paidAt: r.line.paidAt?.toISOString() ?? null,
        notes: r.line.notes,
      })),
    });
  } catch (err) {
    return jsonError(err, request);
  }
}
