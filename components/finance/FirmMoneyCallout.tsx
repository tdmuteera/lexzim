import Link from "next/link";

/**
 * Firm operating money banner (Phase 6). Not trust.
 */
export function FirmMoneyCallout() {
  return (
    <div className="finance-desk-callout firm-desk-callout" role="note">
      <div className="finance-desk-callout-title">Firm operating account</div>
      <p>
        Expenses and business cashbook entries are firm money only. Never record client trust
        deposits, trust disbursements, or fee invoices here.
      </p>
      <p className="finance-desk-callout-link">
        <Link href="/finance/requisitions">Requisitions</Link>
        <span className="muted"> · </span>
        <Link href="/finance/trust">Trust</Link>
        <span className="muted"> · </span>
        <Link href="/finance/invoicing">Invoicing</Link>
        <span className="muted"> · </span>
        <Link href="/finance/payments">Payments</Link>
      </p>
    </div>
  );
}
