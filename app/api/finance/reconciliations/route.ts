import { jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import {
  isReconType,
  parseReconciliationRunInput,
} from "@/lib/finance/reconciliation-validation";
import {
  createReconciliationRun,
  listReconciliationAccountOptions,
  listReconciliationRuns,
  previewBusinessReconciliation,
  previewTrustReconciliation,
} from "@/lib/repos/reconciliation";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

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

/** GET /api/finance/reconciliations — list runs + account options. */
export async function GET(request: Request) {
  try {
    const session = await requirePermission("finance.reconcile");
    const firmId = tenantFirmId(session);
    const url = new URL(request.url);
    const reconTypeRaw = url.searchParams.get("reconType");
    const reconType = reconTypeRaw && isReconType(reconTypeRaw) ? reconTypeRaw : undefined;
    const status = url.searchParams.get("status")?.trim() || undefined;
    const preview = url.searchParams.get("preview") === "1";

    if (preview) {
      const reconTypePreview = url.searchParams.get("reconType");
      const periodYear = Number(url.searchParams.get("periodYear"));
      const periodMonth = Number(url.searchParams.get("periodMonth"));
      const statementRaw = url.searchParams.get("statementDollars");
      const bankAccountLabel = url.searchParams.get("bankAccountLabel")?.trim();
      if (!isReconType(reconTypePreview)) {
        throw new AuthError("validation", "Invalid reconType for preview.");
      }
      const statementBalanceCents =
        statementRaw != null && statementRaw !== ""
          ? Math.round(Number(statementRaw) * 100)
          : null;

      if (reconTypePreview === "business_bank") {
        if (!bankAccountLabel) {
          throw new AuthError("validation", "bankAccountLabel required for business preview.");
        }
        const previewData = await previewBusinessReconciliation(
          firmId,
          bankAccountLabel,
          periodYear,
          periodMonth,
          statementBalanceCents,
        );
        return jsonOk({ preview: previewData });
      }

      const trustAccountId = url.searchParams.get("trustAccountId")?.trim();
      if (!trustAccountId) {
        throw new AuthError("validation", "trustAccountId required for trust preview.");
      }
      const previewData = await previewTrustReconciliation(
        firmId,
        reconTypePreview,
        trustAccountId,
        periodYear,
        periodMonth,
        statementBalanceCents,
      );
      return jsonOk({ preview: previewData });
    }

    const rows = await listReconciliationRuns(firmId, { reconType, status });
    const accounts = await listReconciliationAccountOptions(firmId);

    return jsonOk({
      items: rows.map(serializeRun),
      accounts: {
        bank: accounts.bankAccounts.map((a) => ({
          id: a.id,
          name: a.name,
          currency: a.currency,
        })),
        vault: accounts.vaultAccounts.map((a) => ({
          id: a.id,
          name: a.name,
          currency: a.currency,
        })),
      },
    });
  } catch (err) {
    return jsonError(err, request);
  }
}

/** POST /api/finance/reconciliations — create draft run. */
export async function POST(request: Request) {
  try {
    const session = await requirePermission("finance.reconcile");
    const firmId = tenantFirmId(session);
    const body = await request.json();
    const input = parseReconciliationRunInput(body);
    const run = await createReconciliationRun(firmId, session.id, input);
    return jsonOk({ run: serializeRun({ run }) }, { status: 201 });
  } catch (err) {
    return jsonError(err, request);
  }
}
