import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import {
  parseCompleteReconciliationInput,
  parseReconciliationRunInput,
} from "@/lib/finance/reconciliation-validation";
import {
  completeReconciliationRun,
  getReconciliationRun,
  updateReconciliationRunDraft,
} from "@/lib/repos/reconciliation";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

function serializeRun(row: {
  run: {
    id: string;
    reconType: string;
    periodYear: number;
    periodMonth: number;
    trustAccountId: string | null;
    bankAccountLabel: string | null;
    statementBalanceCents: number;
    ledgerBalanceCents: number;
    varianceCents: number;
    status: string;
    notes: string | null;
    overrideReason: string | null;
    completedBy: string | null;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  };
  trustAccountName?: string | null;
  completedByName?: string | null;
}) {
  return {
    id: row.run.id,
    reconType: row.run.reconType,
    periodYear: row.run.periodYear,
    periodMonth: row.run.periodMonth,
    trustAccountId: row.run.trustAccountId,
    trustAccountName: row.trustAccountName ?? null,
    bankAccountLabel: row.run.bankAccountLabel,
    statementBalanceCents: row.run.statementBalanceCents,
    ledgerBalanceCents: row.run.ledgerBalanceCents,
    varianceCents: row.run.varianceCents,
    status: row.run.status,
    notes: row.run.notes,
    overrideReason: row.run.overrideReason,
    completedByName: row.completedByName ?? null,
    completedAt: row.run.completedAt?.toISOString() ?? null,
    createdAt: row.run.createdAt.toISOString(),
    updatedAt: row.run.updatedAt.toISOString(),
  };
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("finance.reconcile");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const row = await getReconciliationRun(firmId, id);
    if (!row) throw new AuthError("not_found", "Reconciliation run not found.");
    return jsonOk({ run: serializeRun(row) });
  } catch (err) {
    return jsonError(err);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("finance.reconcile");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const body = await request.json();
    const action = typeof body.action === "string" ? body.action : "update";

    if (action === "complete") {
      const completeInput = parseCompleteReconciliationInput(body);
      const run = await completeReconciliationRun(
        firmId,
        session.id,
        id,
        completeInput,
        { isManagingPartner: session.role.code === "managing_partner" },
      );
      if (!run) throw new AuthError("not_found", "Reconciliation run not found.");

      await writeAuditLog({
        action: "finance_recon.complete",
        firmId,
        userId: session.id,
        entityType: "finance_reconciliation_run",
        entityId: id,
        metadata: {
          reconType: run.reconType,
          periodYear: run.periodYear,
          periodMonth: run.periodMonth,
          varianceCents: run.varianceCents,
          overrideReason: run.overrideReason,
        },
        ipOrUserAgent: clientInfo(request),
      });

      const full = await getReconciliationRun(firmId, id);
      return jsonOk({ run: full ? serializeRun(full) : serializeRun({ run }) });
    }

    const input = parseReconciliationRunInput(body);
    const run = await updateReconciliationRunDraft(firmId, id, input);
    if (!run) throw new AuthError("not_found", "Reconciliation run not found.");
    const full = await getReconciliationRun(firmId, id);
    return jsonOk({ run: full ? serializeRun(full) : serializeRun({ run }) });
  } catch (err) {
    return jsonError(err);
  }
}
