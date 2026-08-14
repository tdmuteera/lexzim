import Link from "next/link";

type TrustMoneyCalloutProps = {
  variant?: "desk" | "statement";
};

/**
 * Trust vs fee money wall (Phase 6).
 */
export function TrustMoneyCallout({ variant = "desk" }: TrustMoneyCalloutProps) {
  return (
    <div className="finance-desk-callout trust-desk-callout" role="note">
      <div className="finance-desk-callout-title">Client money (trust)</div>
      <p>
        {variant === "statement"
          ? "This statement shows trust ledger movements only. Fee notes and fee payments are separate."
          : "Receipts, disbursements, transfers, and adjustments here are client trust money. They are not firm fee revenue."}
      </p>
      <p className="finance-desk-callout-link">
        <Link href="/finance/invoicing">Open Invoicing (fee money)</Link>
        <span className="muted"> · never record fee receipts in the trust ledger</span>
      </p>
    </div>
  );
}
