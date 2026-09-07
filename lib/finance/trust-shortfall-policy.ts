/**
 * Trust shortfall policy for disbursement requisition pay (P11-08).
 * Default: warn and allow firm float (recoverable). Optional firm block.
 */
import "server-only";

import {
  evaluateTrustShortfall,
  type TrustShortfallDecision,
} from "@/lib/finance/trust-shortfall-evaluate";
import {
  getFirmSetting,
  upsertFirmSetting,
} from "@/lib/repos/firm-settings";

export {
  evaluateTrustShortfall,
  type TrustShortfallDecision,
} from "@/lib/finance/trust-shortfall-evaluate";

/** When "true", firm float pay is blocked if client trust is short. Default OFF. */
export const BLOCK_DISBURSEMENT_IF_TRUST_SHORT_KEY =
  "block_disbursement_if_trust_short";

/** Default OFF: missing key or anything other than "true" means allow with warning. */
export async function getBlockDisbursementIfTrustShort(
  firmId: string,
): Promise<boolean> {
  const raw = await getFirmSetting(firmId, BLOCK_DISBURSEMENT_IF_TRUST_SHORT_KEY);
  return raw === "true";
}

export async function setBlockDisbursementIfTrustShort(
  firmId: string,
  block: boolean,
): Promise<void> {
  await upsertFirmSetting(
    firmId,
    BLOCK_DISBURSEMENT_IF_TRUST_SHORT_KEY,
    block ? "true" : "false",
  );
}

export async function evaluateTrustShortfallForFirm(
  firmId: string,
  amountCents: number,
  trustBalanceCents: number,
): Promise<TrustShortfallDecision> {
  const blockIfShort = await getBlockDisbursementIfTrustShort(firmId);
  return evaluateTrustShortfall({
    amountCents,
    trustBalanceCents,
    blockIfShort,
  });
}
