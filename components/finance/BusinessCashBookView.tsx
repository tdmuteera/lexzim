"use client";

import Link from "next/link";
import { useState } from "react";
import { Can } from "@/components/auth/Can";
import { CashAccountLedger } from "@/components/finance/CashAccountLedger";
import { FirmMoneyCallout } from "@/components/finance/FirmMoneyCallout";
import { Button } from "@/components/ui/Button";

/** Business Cash Book (GL 1020): firm cash on premises, fed by cash fee receipts. */
export function BusinessCashBookView() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <section className="view active scrollable finance-desk-view" aria-label="Business Cash Book">
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Business Cash Book</h3>
            <p className="panel-subtitle muted">
              Firm cash held on premises. Cash fee receipts recorded under Receipts / Receivables land here.
              Move money to petty cash, the disbursement float or the bank through Funds Transfer.
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
            <Can permission="finance.post">
              <Link href="/finance/transfers" className="btn btn-primary btn-sm">
                Funds Transfer
              </Link>
            </Can>
            <Link href="/finance/payments" className="btn btn-outline btn-sm">
              Record a cash receipt
            </Link>
            <Button size="sm" variant="outline" onClick={() => setRefreshKey((k) => k + 1)}>
              Refresh
            </Button>
          </div>
        </div>
        <div className="panel-body">
          <FirmMoneyCallout />
        </div>
      </div>
      <CashAccountLedger code="1020" title="Business Cash Book" refreshKey={refreshKey} />
    </section>
  );
}
