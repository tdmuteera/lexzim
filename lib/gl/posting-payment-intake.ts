import "server-only";

import { AuthError } from "@/lib/auth/types";
import {
  feeCategoryGlCode,
  type FeeCategory,
} from "@/lib/finance/payment-intake-validation";
import { ensureGlAccountByCode } from "@/lib/gl/accounts";
import { postManualJournal } from "@/lib/gl/journals";

/**
 * Fees-only receipt with no invoice.
 * fee_bank → Dr 1010 Operating Bank / Cr fee revenue.
 * fee_vault → Dr 1020 Business Vault (fee cash on hand) / Cr fee revenue.
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
    /** 1010 fee bank (default) or 1020 fee vault / business vault. */
    cashGlCode?: "1010" | "1020";
  },
) {
  if (input.amountCents < 1) {
    throw new AuthError("validation", "Fee amount must be positive.");
  }

  const cashCode = input.cashGlCode ?? "1010";
  const cash = await ensureGlAccountByCode(firmId, cashCode);
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
      memo:
        input.memo ??
        `Direct fee receipt (${input.feeCategory}) via ${cashCode === "1020" ? "Business Cash Book" : "fee bank"}`,
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

/**
 * Client cost already paid by the firm, recovered before it is billed.
 * Dr 1010 (disbursement account / Operating Bank) or Dr 1060 (disbursement float), Cr 1320.
 * An invoice payment does not use this: billing already cleared 1320, so that receipt credits 1310.
 */
export async function postCostRecoveryGl(
  firmId: string,
  userId: string,
  input: {
    sourceId: string;
    amountCents: number;
    currency: string;
    entryDate: Date;
    reference: string;
    clientId: string;
    matterId: string | null;
    cashGlCode: "1010" | "1060";
    memo?: string;
  },
) {
  if (input.amountCents < 1) {
    throw new AuthError("validation", "Recovery amount must be positive.");
  }
  const cash = await ensureGlAccountByCode(firmId, input.cashGlCode);
  const advances = await ensureGlAccountByCode(firmId, "1320");
  const place = input.cashGlCode === "1060" ? "disbursement float" : "disbursement account";
  return postManualJournal(
    firmId,
    userId,
    {
      entryDate: input.entryDate,
      reference: input.reference,
      memo: input.memo ?? `Recovery of client costs into the ${place}`,
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
          accountId: advances.id,
          debitCents: 0,
          creditCents: input.amountCents,
          clientId: input.clientId,
          matterId: input.matterId,
          currency: input.currency,
        },
      ],
    },
    "payment_intake",
    input.sourceId,
  );
}
