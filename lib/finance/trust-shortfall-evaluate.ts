/**
 * Pure trust shortfall evaluator (no DB). Safe for smoke scripts.
 */

export type TrustShortfallDecision = {
  trustBalanceCents: number;
  amountCents: number;
  shortfallCents: number;
  isShort: boolean;
  blockIfShort: boolean;
  /** May pay from firm float (recoverable) when short. */
  allowFirmFloat: boolean;
  /** Prefer trust when balance covers amount. */
  preferTrust: boolean;
  message: string;
};

/** Pure policy evaluator (also used by smoke script). */
export function evaluateTrustShortfall(input: {
  amountCents: number;
  trustBalanceCents: number;
  blockIfShort: boolean;
}): TrustShortfallDecision {
  const shortfallCents = Math.max(0, input.amountCents - input.trustBalanceCents);
  const isShort = shortfallCents > 0;
  const preferTrust = !isShort;
  const allowFirmFloat = !isShort || !input.blockIfShort;

  let message: string;
  if (!isShort) {
    message = "Trust balance covers this disbursement. Prefer pay from trust.";
  } else if (input.blockIfShort) {
    message = `Trust short by ${(shortfallCents / 100).toFixed(2)}. Firm setting blocks firm-float pay until the client tops up trust.`;
  } else {
    message = `Trust short by ${(shortfallCents / 100).toFixed(2)}. You may pay from firm float now (recoverable) or wait for a trust top-up.`;
  }

  return {
    trustBalanceCents: input.trustBalanceCents,
    amountCents: input.amountCents,
    shortfallCents,
    isShort,
    blockIfShort: input.blockIfShort,
    allowFirmFloat,
    preferTrust,
    message,
  };
}
