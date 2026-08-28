import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { parseSalaryAdvanceCreateInput } from "@/lib/hr/validation";
import { getStaffProfileByUserId } from "@/lib/repos/hr";
import {
  createSalaryAdvance,
  getSalaryAdvance,
  listSalaryAdvances,
  notifyAdvanceApprovers,
} from "@/lib/repos/hr-salary-advances";
import { hasPermission, requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

function serializeAdvance(
  row: NonNullable<Awaited<ReturnType<typeof getSalaryAdvance>>>,
) {
  const a = row.advance;
  return {
    id: a.id,
    staffProfileId: a.staffProfileId,
    staffName: row.staffName,
    employeeName: a.employeeName,
    positionTitle: a.positionTitle,
    department: a.department,
    employeeNumber: a.employeeNumber,
    applicationDate: a.applicationDate.toISOString(),
    amountCents: a.amountCents,
    amountInWords: a.amountInWords,
    reason: a.reason,
    declarationAcceptedAt: a.declarationAcceptedAt?.toISOString() ?? null,
    grossSalaryCents: a.grossSalaryCents,
    netSalaryCents: a.netSalaryCents,
    existingAdvanceBalanceCents: a.existingAdvanceBalanceCents,
    proposedAdvanceCents: a.proposedAdvanceCents,
    proposedMonthlyDeductionCents: a.proposedMonthlyDeductionCents,
    recommendedMonths: a.recommendedMonths,
    preparedByUserId: a.preparedByUserId,
    preparedByName: row.preparedByName,
    financeNotes: a.financeNotes,
    financeReviewedAt: a.financeReviewedAt?.toISOString() ?? null,
    decision: a.decision,
    approvedAmountCents: a.approvedAmountCents,
    monthlyDeductionCents: a.monthlyDeductionCents,
    repaymentMonths: a.repaymentMonths,
    effectiveDeductionDate: a.effectiveDeductionDate?.toISOString() ?? null,
    managementComments: a.managementComments,
    authorisedByUserId: a.authorisedByUserId,
    decidedAt: a.decidedAt?.toISOString() ?? null,
    balanceRemainingCents: a.balanceRemainingCents,
    status: a.status,
    paidAt: a.paidAt?.toISOString() ?? null,
    createdBy: a.createdBy,
    createdAt: a.createdAt.toISOString(),
  };
}

/**
 * GET /api/hr/salary-advances?staffProfileId=&status=
 * POST /api/hr/salary-advances
 */
export async function GET(request: Request) {
  try {
    const session = await requirePermission("hr.view");
    const firmId = tenantFirmId(session);
    const url = new URL(request.url);
    const staffProfileId = url.searchParams.get("staffProfileId")?.trim() || undefined;
    const status = url.searchParams.get("status")?.trim() || undefined;
    const rows = await listSalaryAdvances(firmId, { staffProfileId, status });
    const self = await getStaffProfileByUserId(firmId, session.id);
    return jsonOk({
      items: rows.map((r) =>
        serializeAdvance({
          advance: r.advance,
          staffName: r.staffName,
          staffUserId: null,
          preparedByName: r.preparedByName,
        }),
      ),
      selfStaffProfileId: self?.profile.id ?? null,
    });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("hr.view");
    const firmId = tenantFirmId(session);
    const canManage = hasPermission(session, "hr.manage");
    const body = await request.json();
    const input = parseSalaryAdvanceCreateInput(body);

    if (!canManage) {
      const self = await getStaffProfileByUserId(firmId, session.id);
      if (!self || self.profile.id !== input.staffProfileId) {
        throw new AuthError(
          "forbidden",
          "You can only submit a salary advance for your own HR profile.",
        );
      }
    }

    const created = await createSalaryAdvance(firmId, session.id, input);

    await writeAuditLog({
      action: "hr_advance.create",
      firmId,
      userId: session.id,
      entityType: "hr_salary_advance",
      entityId: created.id,
      metadata: {
        staffProfileId: created.staffProfileId,
        amountCents: created.amountCents,
      },
      ipOrUserAgent: clientInfo(request),
    });

    await notifyAdvanceApprovers({
      firmId,
      advanceId: created.id,
      employeeName: created.employeeName,
      excludeUserId: session.id,
    });

    const full = await getSalaryAdvance(firmId, created.id);
    return jsonOk(
      { advance: full ? serializeAdvance(full) : null },
      { status: 201 },
    );
  } catch (err) {
    return jsonError(err, request);
  }
}
