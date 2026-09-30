import Link from "next/link";

type TrustMoneyCalloutProps = {
  variant?: "desk" | "statement";
};

/**
 * Trust vs fee money wall (Phase 6) with four-account clarity (P7-07).
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
      <div
        className="muted"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "0.5rem",
          fontSize: "0.78rem",
          margin: "0.5rem 0",
        }}
      >
        <div>
          <strong>Business Cash Book</strong>
          <br />
          Firm cash on hand (GL 1020)
        </div>
        <div>
          <strong>Fee / operating bank</strong>
          <br />
          Firm bank account (GL 1010)
        </div>
        <div>
          <strong>Trust vault</strong>
          <br />
          Client cash held in vault
        </div>
        <div>
          <strong>Trust bank</strong>
          <br />
          Client money at bank (GL 1210)
        </div>
      </div>
      <p className="finance-desk-callout-link">
        <Link href="/finance/payments">Receipts / Receivables</Link>
        <span className="muted"> · </span>
        <Link href="/finance/client-accounts">Client accounts</Link>
        <span className="muted"> · </span>
        <Link href="/finance/invoicing">Invoicing (fee money)</Link>
        <span className="muted"> · never record fee receipts in the trust ledger</span>
      </p>
    </div>
  );
}
