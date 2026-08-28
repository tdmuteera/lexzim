import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import {
  parseSalaryAdvanceDecideInput,
  parseSalaryAdvanceFinanceInput,
} from "@/lib/hr/validation";
import {
  decideSalaryAdvance,
  financeReviewSalaryAdvance,
  getSalaryAdvance,
  markSalaryAdvancePaid,
  notifyAdvanceApprovers,
  notifyAdvanceCreator,
} from "@/lib/repos/hr-salary-advances";
import { hasAnyPermission, hasPermission, requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

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

export async function GET(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("hr.view");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const row = await getSalaryAdvance(firmId, id);
    if (!row) {
      throw new AuthError("not_found", "Salary advance not found.");
    }
    return jsonOk({ advance: serializeAdvance(row) });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("hr.view");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const existing = await getSalaryAdvance(firmId, id);
    if (!existing) {
      throw new AuthError("not_found", "Salary advance not found.");
    }

    const body = (await request.json()) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action.trim() : "";

    if (action === "finance") {
      if (!hasPermission(session, "hr.manage")) {
        throw new AuthError("forbidden", "Finance review requires hr.manage.");
      }
      const input = parseSalaryAdvanceFinanceInput(body);
      const updated = await financeReviewSalaryAdvance(firmId, id, session.id, input);

      await writeAuditLog({
        action: "hr_advance.finance_review",
        firmId,
        userId: session.id,
        entityType: "hr_salary_advance",
        entityId: id,
        metadata: {
          proposedAdvanceCents: updated.proposedAdvanceCents,
          recommendedMonths: updated.recommendedMonths,
        },
        ipOrUserAgent: clientInfo(request),
      });

      await notifyAdvanceApprovers({
        firmId,
        advanceId: id,
        employeeName: updated.employeeName,
        excludeUserId: session.id,
      });
    } else if (action === "decide") {
      if (!hasAnyPermission(session, ["payroll.advance.approve", "hr.manage"])) {
        throw new AuthError(
          "forbidden",
          "Decision requires payroll.advance.approve or hr.manage.",
        );
      }
      const input = parseSalaryAdvanceDecideInput(body);
      const updated = await decideSalaryAdvance(firmId, id, session.id, input);

      await writeAuditLog({
        action: "hr_advance.decide",
        firmId,
        userId: session.id,
        entityType: "hr_salary_advance",
        entityId: id,
        metadata: {
          decision: updated.decision,
          approvedAmountCents: updated.approvedAmountCents,
        },
        ipOrUserAgent: clientInfo(request),
      });

      await notifyAdvanceCreator({
        firmId,
        creatorUserId: existing.advance.createdBy,
        advanceId: id,
        employeeName: updated.employeeName,
        decision: updated.decision ?? input.decision,
        actorUserId: session.id,
        comments: input.managementComments,
      });
    } else if (action === "mark_paid") {
      if (!hasPermission(session, "hr.manage")) {
        throw new AuthError("forbidden", "Mark paid requires hr.manage.");
      }
      const updated = await markSalaryAdvancePaid(firmId, id);

      await writeAuditLog({
        action: "hr_advance.mark_paid",
        firmId,
        userId: session.id,
        entityType: "hr_salary_advance",
        entityId: id,
        metadata: {
          approvedAmountCents: updated.approvedAmountCents,
          balanceRemainingCents: updated.balanceRemainingCents,
        },
        ipOrUserAgent: clientInfo(request),
      });
    } else {
      throw new AuthError(
        "validation",
        "action must be finance, decide, or mark_paid.",
      );
    }

    const full = await getSalaryAdvance(firmId, id);
    return jsonOk({ advance: full ? serializeAdvance(full) : null });
  } catch (err) {
    return jsonError(err, request);
  }
}
