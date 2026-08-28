import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { getPayrollLine, markPayrollLinePaid } from "@/lib/repos/hr-payroll";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/hr/payroll/lines/[id]/mark-paid
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("hr.manage");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const existing = await getPayrollLine(firmId, id);
    if (!existing) {
      throw new AuthError("not_found", "Payroll line not found.");
    }

    const updated = await markPayrollLinePaid(firmId, id, session.id);

    await writeAuditLog({
      action: "hr_payroll.line_mark_paid",
      firmId,
      userId: session.id,
      entityType: "hr_payroll_line",
      entityId: id,
      metadata: {
        staffProfileId: updated.staffProfileId,
        deductionsCents: updated.deductionsCents,
        netPayableCents: updated.netPayableCents,
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({
      line: {
        id: updated.id,
        staffProfileId: updated.staffProfileId,
        grossCents: updated.grossCents,
        advancesOutstandingCents: updated.advancesOutstandingCents,
        deductionsCents: updated.deductionsCents,
        netPayableCents: updated.netPayableCents,
        advanceIds: updated.advanceIdsJson,
        paidAt: updated.paidAt?.toISOString() ?? null,
        notes: updated.notes,
      },
    });
  } catch (err) {
    return jsonError(err, request);
  }
}
