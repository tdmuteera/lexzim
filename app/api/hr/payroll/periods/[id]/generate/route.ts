import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import {
  generatePayrollLines,
  getPayrollPeriod,
  getPayrollPeriodWithLines,
} from "@/lib/repos/hr-payroll";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/hr/payroll/periods/[id]/generate
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("hr.manage");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const period = await getPayrollPeriod(firmId, id);
    if (!period) {
      throw new AuthError("not_found", "Payroll period not found.");
    }

    const generated = await generatePayrollLines(firmId, id);

    await writeAuditLog({
      action: "hr_payroll.generate",
      firmId,
      userId: session.id,
      entityType: "hr_payroll_period",
      entityId: id,
      metadata: { lineCount: generated.length },
      ipOrUserAgent: clientInfo(request),
    });

    const data = await getPayrollPeriodWithLines(firmId, id);
    return jsonOk({
      generated: generated.length,
      period: data
        ? {
            id: data.period.id,
            label: data.period.label,
            periodStart: data.period.periodStart.toISOString(),
            periodEnd: data.period.periodEnd.toISOString(),
            status: data.period.status,
          }
        : null,
      lines: (data?.lines ?? []).map((r) => ({
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
