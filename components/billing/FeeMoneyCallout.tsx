import Link from "next/link";

type FeeMoneyCalloutProps = {
  variant?: "list" | "detail";
};

/**
 * Fee vs trust wall — visible on invoicing screens (Phase 6).
 */
export function FeeMoneyCallout({ variant = "list" }: FeeMoneyCalloutProps) {
  return (
    <div className="finance-desk-callout" role="note">
      <div className="finance-desk-callout-title">Fee money (firm)</div>
      <p>
        {variant === "list"
          ? "Invoices and fee payments recorded here are firm revenue. They are not client trust money."
          : "Payments on this fee note are fee receipts only. Client trust deposits and disbursements stay in Trust."}
      </p>
      <p className="finance-desk-callout-link">
        <Link href="/finance/payments">Receipts / Receivables</Link>
        <span className="muted"> · </span>
        <Link href="/finance/client-accounts">Client accounts</Link>
        <span className="muted"> · </span>
        <Link href="/finance/trust">Trust (client money)</Link>
        <span className="muted"> · never mix fee receipts with trust ledger entries</span>
      </p>
    </div>
  );
}
