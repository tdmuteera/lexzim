/** Starter approval thresholds for Finance requisitions (P11-07). */

/** Business requisitions at or above this amount need Managing Partner approval. */
export const REQUISITION_BUSINESS_MP_THRESHOLD_CENTS = 50_000; // $500

/** Disbursement requisitions at or above this amount need Managing Partner approval. */
export const REQUISITION_DISBURSEMENT_MP_THRESHOLD_CENTS = 50_000; // $500

export type RequisitionApprovalTier = {
  requiresManagingPartner: boolean;
  reason: string;
};

/**
 * Starter defaults:
 * - Business under threshold → Accounts / Office Manager may approve
 * - Business over threshold → Managing Partner
 * - Disbursement within trust and under threshold → Finance/OM after approval
 * - Disbursement firm float, over threshold, or above trust balance → Managing Partner
 */
export function requisitionApprovalTier(input: {
  type: "business" | "disbursement";
  amountCents: number;
  paidFrom?: "trust" | "firm_float" | "operating" | null;
  trustBalanceCents?: number | null;
}): RequisitionApprovalTier {
  if (input.type === "business") {
    if (input.amountCents >= REQUISITION_BUSINESS_MP_THRESHOLD_CENTS) {
      return {
        requiresManagingPartner: true,
        reason: `Business amount is at or above $${(REQUISITION_BUSINESS_MP_THRESHOLD_CENTS / 100).toFixed(0)} starter threshold.`,
      };
    }
    return {
      requiresManagingPartner: false,
      reason: "Business under threshold: Accounts / Office Manager may approve.",
    };
  }

  if (input.paidFrom === "firm_float") {
    return {
      requiresManagingPartner: true,
      reason: "Firm float disbursements require Managing Partner approval.",
    };
  }
  if (input.amountCents >= REQUISITION_DISBURSEMENT_MP_THRESHOLD_CENTS) {
    return {
      requiresManagingPartner: true,
      reason: `Disbursement amount is at or above $${(REQUISITION_DISBURSEMENT_MP_THRESHOLD_CENTS / 100).toFixed(0)} starter threshold.`,
    };
  }
  if (
    input.trustBalanceCents != null &&
    input.amountCents > input.trustBalanceCents
  ) {
    return {
      requiresManagingPartner: true,
      reason: "Requested amount exceeds current client trust balance (firm float path).",
    };
  }
  return {
    requiresManagingPartner: false,
    reason: "Disbursement within trust and under threshold: Finance / Office Manager may approve.",
  };
}
