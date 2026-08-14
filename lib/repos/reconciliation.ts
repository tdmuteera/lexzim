/**
 * Finance reconciliation runs (Phase 6 P6-08).
 */
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { AuthError } from "@/lib/auth/types";
import { getDb } from "@/lib/db";
import {
  financeReconciliationRuns,
  trustAccounts,
  users,
} from "@/lib/db/schema";
import type {
  CompleteReconciliationInput,
  ReconciliationRunInput,
  ReconType,
} from "@/lib/finance/reconciliation-validation";
import {
  getClientTrustSumOnAccount,
  getTrustAccount,
  getTrustAccountBalance,
  listTrustAccounts,
} from "@/lib/repos/trust";
import { getBusinessCashbookBalance } from "@/lib/repos/firm-finance";

export type ReconciliationPreview = {
  reconType: ReconType;
  periodYear: number;
  periodMonth: number;
  trustAccountId: string | null;
  trustAccountName: string | null;
  currency: string;
  /** A: external statement or counted balance (user enters). */
  statementBalanceCents: number | null;
  /** B: LexZim book balance on trust account. */
  accountBookBalanceCents: number;
  /** Sum of client-tagged balances on this account (three-way check). */
  clientLedgerSumCents: number;
  /** Client sum vs book — should be zero when all money is client-tagged. */
  clientBookVarianceCents: number;
  notes: string | null;
};

export async function previewTrustReconciliation(
  firmId: string,
  reconType: "trust_bank" | "trust_vault",
  trustAccountId: string,
  periodYear: number,
  periodMonth: number,
  statementBalanceCents?: number | null,
): Promise<ReconciliationPreview> {
  const account = await getTrustAccount(firmId, trustAccountId);
  if (!account) {
    throw new AuthError("not_found", "Trust account not found.");
  }
  if (reconType === "trust_bank" && account.accountKind !== "bank") {
    throw new AuthError("validation", "Select a bank trust account for trust bank reconciliation.");
  }
  if (reconType === "trust_vault" && account.accountKind !== "vault") {
    throw new AuthError("validation", "Select a vault trust account for vault reconciliation.");
  }

  const accountBookBalanceCents = await getTrustAccountBalance(firmId, trustAccountId);
  const clientLedgerSumCents = await getClientTrustSumOnAccount(firmId, trustAccountId);

  return {
    reconType,
    periodYear,
    periodMonth,
    trustAccountId,
    trustAccountName: account.name,
    currency: account.currency,
    statementBalanceCents: statementBalanceCents ?? null,
    accountBookBalanceCents,
    clientLedgerSumCents,
    clientBookVarianceCents: clientLedgerSumCents - accountBookBalanceCents,
    notes: null,
  };
}

export async function previewBusinessReconciliation(
  firmId: string,
  bankAccountLabel: string,
  periodYear: number,
  periodMonth: number,
  statementBalanceCents?: number | null,
): Promise<ReconciliationPreview> {
  const bookBalance = await getBusinessCashbookBalance(firmId, {
    bankAccountLabel,
  });

  return {
    reconType: "business_bank",
    periodYear,
    periodMonth,
    trustAccountId: null,
    trustAccountName: bankAccountLabel,
    currency: "USD",
    statementBalanceCents: statementBalanceCents ?? null,
    accountBookBalanceCents: bookBalance,
    clientLedgerSumCents: bookBalance,
    clientBookVarianceCents: 0,
    notes: null,
  };
}

export async function listReconciliationRuns(
  firmId: string,
  opts?: {
    reconType?: ReconType;
    status?: string;
    periodYear?: number;
    periodMonth?: number;
  },
) {
  const db = getDb();
  const conditions = [eq(financeReconciliationRuns.firmId, firmId)];
  if (opts?.reconType) {
    conditions.push(eq(financeReconciliationRuns.reconType, opts.reconType));
  }
  if (opts?.status) {
    conditions.push(eq(financeReconciliationRuns.status, opts.status));
  }
  if (opts?.periodYear !== undefined) {
    conditions.push(eq(financeReconciliationRuns.periodYear, opts.periodYear));
  }
  if (opts?.periodMonth !== undefined) {
    conditions.push(eq(financeReconciliationRuns.periodMonth, opts.periodMonth));
  }

  return db
    .select({
      run: financeReconciliationRuns,
      trustAccountName: trustAccounts.name,
      completedByName: users.fullName,
    })
    .from(financeReconciliationRuns)
    .leftJoin(
      trustAccounts,
      and(
        eq(trustAccounts.id, financeReconciliationRuns.trustAccountId),
        eq(trustAccounts.firmId, firmId),
      ),
    )
    .leftJoin(users, eq(users.id, financeReconciliationRuns.completedBy))
    .where(and(...conditions))
    .orderBy(
      desc(financeReconciliationRuns.periodYear),
      desc(financeReconciliationRuns.periodMonth),
      desc(financeReconciliationRuns.createdAt),
    )
    .limit(100);
}

export async function getReconciliationRun(firmId: string, id: string) {
  const db = getDb();
  const rows = await db
    .select({
      run: financeReconciliationRuns,
      trustAccountName: trustAccounts.name,
      completedByName: users.fullName,
    })
    .from(financeReconciliationRuns)
    .leftJoin(
      trustAccounts,
      and(
        eq(trustAccounts.id, financeReconciliationRuns.trustAccountId),
        eq(trustAccounts.firmId, firmId),
      ),
    )
    .leftJoin(users, eq(users.id, financeReconciliationRuns.completedBy))
    .where(and(eq(financeReconciliationRuns.firmId, firmId), eq(financeReconciliationRuns.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

async function computeLedgerBalanceCents(
  firmId: string,
  input: ReconciliationRunInput,
): Promise<number> {
  if (input.reconType === "business_bank") {
    return getBusinessCashbookBalance(firmId, {
      bankAccountLabel: input.bankAccountLabel ?? undefined,
    });
  }
  if (!input.trustAccountId) {
    throw new AuthError("validation", "Trust account is required.");
  }
  return getTrustAccountBalance(firmId, input.trustAccountId);
}

export async function createReconciliationRun(
  firmId: string,
  userId: string,
  input: ReconciliationRunInput,
) {
  const ledgerBalanceCents = await computeLedgerBalanceCents(firmId, input);
  const varianceCents = input.statementBalanceCents - ledgerBalanceCents;

  const db = getDb();
  const rows = await db
    .insert(financeReconciliationRuns)
    .values({
      firmId,
      reconType: input.reconType,
      periodYear: input.periodYear,
      periodMonth: input.periodMonth,
      trustAccountId: input.trustAccountId,
      bankAccountLabel: input.bankAccountLabel,
      statementBalanceCents: input.statementBalanceCents,
      ledgerBalanceCents,
      varianceCents,
      status: "draft",
      notes: input.notes,
      createdBy: userId,
      updatedAt: new Date(),
    })
    .returning();

  return rows[0]!;
}

export async function updateReconciliationRunDraft(
  firmId: string,
  id: string,
  input: ReconciliationRunInput,
) {
  const existing = await getReconciliationRun(firmId, id);
  if (!existing) {
    throw new AuthError("not_found", "Reconciliation run not found.");
  }
  if (existing.run.status !== "draft") {
    throw new AuthError("validation", "Only draft reconciliation runs can be edited.");
  }

  const ledgerBalanceCents = await computeLedgerBalanceCents(firmId, input);
  const varianceCents = input.statementBalanceCents - ledgerBalanceCents;

  const db = getDb();
  const rows = await db
    .update(financeReconciliationRuns)
    .set({
      reconType: input.reconType,
      periodYear: input.periodYear,
      periodMonth: input.periodMonth,
      trustAccountId: input.trustAccountId,
      bankAccountLabel: input.bankAccountLabel,
      statementBalanceCents: input.statementBalanceCents,
      ledgerBalanceCents,
      varianceCents,
      notes: input.notes,
      updatedAt: new Date(),
    })
    .where(and(eq(financeReconciliationRuns.firmId, firmId), eq(financeReconciliationRuns.id, id)))
    .returning();

  return rows[0] ?? null;
}

export async function completeReconciliationRun(
  firmId: string,
  userId: string,
  id: string,
  input: CompleteReconciliationInput,
  opts: { isManagingPartner: boolean },
) {
  const existing = await getReconciliationRun(firmId, id);
  if (!existing) {
    throw new AuthError("not_found", "Reconciliation run not found.");
  }
  if (existing.run.status === "completed") {
    throw new AuthError("validation", "Reconciliation run is already completed.");
  }

  const varianceCents = existing.run.varianceCents;
  if (varianceCents !== 0) {
    if (!input.overrideReason) {
      throw new AuthError(
        "validation",
        "Variance is not zero. Provide an override reason (Managing Partner only) or correct the figures.",
      );
    }
    if (!opts.isManagingPartner) {
      throw new AuthError(
        "forbidden",
        "Only the Managing Partner may complete a reconciliation with non-zero variance.",
      );
    }
  }

  const db = getDb();
  const rows = await db
    .update(financeReconciliationRuns)
    .set({
      status: "completed",
      overrideReason: varianceCents !== 0 ? input.overrideReason : null,
      completedBy: userId,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(financeReconciliationRuns.firmId, firmId), eq(financeReconciliationRuns.id, id)))
    .returning();

  return rows[0] ?? null;
}

export async function listReconciliationAccountOptions(firmId: string) {
  const accounts = await listTrustAccounts(firmId, false);
  return {
    bankAccounts: accounts.filter((a) => a.accountKind === "bank" && a.isActive),
    vaultAccounts: accounts.filter((a) => a.accountKind === "vault" && a.isActive),
  };
}
