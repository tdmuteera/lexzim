"use client";

import Link from "next/link";
import { useState } from "react";
import { CashAccountLedger } from "@/components/finance/CashAccountLedger";
import { DisbursementFloatPanel } from "@/components/finance/DisbursementFloatPanel";
import { FirmMoneyCallout } from "@/components/finance/FirmMoneyCallout";

/** Disbursement float (GL 1060): firm money that covers client disbursements when trust is short. */
export function DisbursementsView() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <section className="view active scrollable finance-desk-view" aria-label="Disbursement float">
      <div className="panel" style={{ marginBottom: "1rem" }}>
        <div className="panel-head">
          <div>
            <h3>Disbursements</h3>
            <p className="panel-subtitle muted">
              Client disbursements are paid from the client&apos;s trust balance first. When trust is short the
              float covers the difference and the amount is recovered from the client back into the float.
              The float is topped back up to its monthly target from the bank or the Business Cash Book, and
              the Managing Partner may move any excess back.
            </p>
          </div>
          <Link href="/finance/requisitions" className="btn btn-outline btn-sm">
            Disbursement requisitions
          </Link>
        </div>
        <div className="panel-body">
          <FirmMoneyCallout />
        </div>
      </div>
      <DisbursementFloatPanel onChanged={() => setRefreshKey((k) => k + 1)} />
      <CashAccountLedger code="1060" title="Disbursement Float postings" refreshKey={refreshKey} />
    </section>
  );
}
