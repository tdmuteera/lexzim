import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { parsePayrollPeriodCreateInput } from "@/lib/hr/validation";
import {
  createPayrollPeriod,
  listPayrollPeriods,
} from "@/lib/repos/hr-payroll";
import { hasPermission, requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

function serializePeriod(p: Awaited<ReturnType<typeof listPayrollPeriods>>[number]) {
  return {
    id: p.id,
    label: p.label,
    periodStart: p.periodStart.toISOString(),
    periodEnd: p.periodEnd.toISOString(),
    status: p.status,
    createdBy: p.createdBy,
    createdAt: p.createdAt.toISOString(),
  };
}

/**
 * GET /api/hr/payroll/periods
 * POST /api/hr/payroll/periods
 */
export async function GET(request: Request) {
  try {
    const session = await requirePermission("hr.view");
    const firmId = tenantFirmId(session);
    const rows = await listPayrollPeriods(firmId);
    return jsonOk({ items: rows.map(serializePeriod) });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("hr.manage");
    const firmId = tenantFirmId(session);
    const body = await request.json();
    const input = parsePayrollPeriodCreateInput(body);
    const period = await createPayrollPeriod(firmId, session.id, input);

    await writeAuditLog({
      action: "hr_payroll.period_create",
      firmId,
      userId: session.id,
      entityType: "hr_payroll_period",
      entityId: period.id,
      metadata: {
        label: period.label,
        periodStart: period.periodStart.toISOString(),
        periodEnd: period.periodEnd.toISOString(),
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk(
      {
        period: serializePeriod(period),
        canManage: hasPermission(session, "hr.manage"),
      },
      { status: 201 },
    );
  } catch (err) {
    return jsonError(err, request);
  }
}
