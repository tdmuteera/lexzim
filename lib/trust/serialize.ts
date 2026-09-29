import type { trustAccounts, trustLedgerEntries } from "@/lib/db/schema";

type AccountRow = typeof trustAccounts.$inferSelect;
type LedgerRow = typeof trustLedgerEntries.$inferSelect;

export function serializeTrustAccount(
  row: AccountRow,
  opts?: { balanceCents?: number },
) {
  return {
    id: row.id,
    firmId: row.firmId,
    name: row.name,
    currency: row.currency,
    accountRef: row.accountRef,
    accountKind: row.accountKind,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    balanceCents: opts?.balanceCents ?? 0,
  };
}

export function serializeTrustLedgerEntry(
  row: LedgerRow,
  opts?: {
    accountName?: string | null;
    clientDisplayName?: string | null;
    matterTitle?: string | null;
    runningBalanceCents?: number;
  },
) {
  return {
    id: row.id,
    firmId: row.firmId,
    trustAccountId: row.trustAccountId,
    matterId: row.matterId,
    clientId: row.clientId,
    entryType: row.entryType,
    amountCents: row.amountCents,
    currency: row.currency,
    occurredAt: row.occurredAt.toISOString(),
    reference: row.reference,
    referenceNumber: row.referenceNumber,
    narrative: row.narrative,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    invoiceId: row.invoiceId,
    requisitionId: row.requisitionId,
    intakeId: row.intakeId,
    transferGroupId: row.transferGroupId,
    counterpartyClientId: row.counterpartyClientId,
    reversalOfId: row.reversalOfId,
    reversedById: row.reversedById,
    reversalReason: row.reversalReason,
    authorisedBy: row.authorisedBy,
    authorisationNote: row.authorisationNote,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    accountName: opts?.accountName ?? null,
    clientDisplayName: opts?.clientDisplayName ?? null,
    matterTitle: opts?.matterTitle ?? null,
    runningBalanceCents: opts?.runningBalanceCents,
  };
}
