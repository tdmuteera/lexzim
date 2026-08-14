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
        <Link href="/finance/trust">Client trust money → Trust</Link>
        <span className="muted"> · fee invoices → Invoicing</span>
      </p>
    </div>
  );
}
