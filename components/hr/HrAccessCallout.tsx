import Link from "next/link";

/**
 * Clarifies HR records vs platform user access (Phase 6 P6-12).
 */
export function HrAccessCallout() {
  return (
    <div className="finance-desk-callout firm-desk-callout hr-callout" role="note">
      <div className="finance-desk-callout-title hr-callout-title">HR staff records</div>
      <p>
        Employment profiles and contracts for everyone who works at the firm, including staff
        without a LexZim login. This is separate from platform access and roles.
      </p>
      <p className="finance-desk-callout-link">
        <Link href="/staff">User access &amp; roles → User access</Link>
      </p>
    </div>
  );
}
