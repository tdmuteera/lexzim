import "server-only";

import { AuthError } from "@/lib/auth/types";
import {
  feeCategoryGlCode,
  type FeeCategory,
} from "@/lib/finance/payment-intake-validation";
import { ensureGlAccountByCode } from "@/lib/gl/accounts";
import { postManualJournal } from "@/lib/gl/journals";

/**
 * Recognise fee revenue from client trust after money is already in trust (Payments split).
 * Dr 2100 trust liability / Cr fee revenue. Does not move trust bank (1210).
 */
export async function postFeeEarnedFromTrustGl(
  firmId: string,
  userId: string,
  input: {
    sourceId: string;
    amountCents: number;
    currency: string;
    entryDate: Date;
    reference: string;
    feeCategory: FeeCategory;
    clientId: string;
    matterId: string | null;
    memo?: string;
  },
) {
  if (input.amountCents < 1) {
    throw new AuthError("validation", "Fee amount must be positive.");
  }

  const trustLiability = await ensureGlAccountByCode(firmId, "2100");
  const revenue = await ensureGlAccountByCode(
    firmId,
    feeCategoryGlCode(input.feeCategory),
  );

  return postManualJournal(
    firmId,
    userId,
    {
      entryDate: input.entryDate,
      reference: input.reference,
      memo: input.memo ?? `Fee from trust (${input.feeCategory})`,
      lines: [
        {
          accountId: trustLiability.id,
          debitCents: input.amountCents,
          creditCents: 0,
          clientId: input.clientId,
          matterId: input.matterId,
          currency: input.currency,
          lineMemo: "Trust liability released to fees",
        },
        {
          accountId: revenue.id,
          debitCents: 0,
          creditCents: input.amountCents,
          clientId: input.clientId,
          matterId: input.matterId,
          currency: input.currency,
          lineMemo: input.feeCategory,
        },
      ],
    },
    "payment_intake",
    input.sourceId,
  );
}

/**
 * Fees-only cash into firm fee bank with no invoice: Dr 1010 / Cr fee revenue.
 */
export async function postDirectFeeCashGl(
  firmId: string,
  userId: string,
  input: {
    sourceId: string;
    amountCents: number;
    currency: string;
    entryDate: Date;
    reference: string;
    feeCategory: FeeCategory;
    clientId: string;
    matterId: string | null;
    memo?: string;
  },
) {
  if (input.amountCents < 1) {
    throw new AuthError("validation", "Fee amount must be positive.");
  }

  const cash = await ensureGlAccountByCode(firmId, "1010");
  const revenue = await ensureGlAccountByCode(
    firmId,
    feeCategoryGlCode(input.feeCategory),
  );

  return postManualJournal(
    firmId,
    userId,
    {
      entryDate: input.entryDate,
      reference: input.reference,
      memo: input.memo ?? `Direct fee receipt (${input.feeCategory})`,
      lines: [
        {
          accountId: cash.id,
          debitCents: input.amountCents,
          creditCents: 0,
          clientId: input.clientId,
          matterId: input.matterId,
          currency: input.currency,
        },
        {
          accountId: revenue.id,
          debitCents: 0,
          creditCents: input.amountCents,
          clientId: input.clientId,
          matterId: input.matterId,
          currency: input.currency,
          lineMemo: input.feeCategory,
        },
      ],
    },
    "payment_intake",
    input.sourceId,
  );
}
