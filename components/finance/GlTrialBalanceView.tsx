"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExportMenu } from "@/components/export/ExportMenu";
import { AccountingSubNav } from "@/components/finance/AccountingSubNav";
import { FirmMoneyCallout } from "@/components/finance/FirmMoneyCallout";
import { EmptyState } from "@/components/ui/EmptyState";
import { centsToDisplay } from "@/lib/billing/money";

type TrialBalanceRow = {
  code: string;
  name: string;
  type: string;
  debitCents: number;
  creditCents: number;
};

type TrialBalanceReport = {
  asOf: string;
  currency: string;
  rows: TrialBalanceRow[];
  totalDebitCents: number;
  totalCreditCents: number;
};

function todayInput() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function GlTrialBalanceView() {
  const [asOf, setAsOf] = useState(todayInput);
  const [report, setReport] = useState<TrialBalanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        asOf: new Date(`${asOf}T23:59:59`).toISOString(),
      });
      const res = await fetch(`/api/finance/gl/trial-balance?${params}`, {
        credentials: "include",
      });
      const body = (await res.json()) as {
        ok?: boolean;
        data?: { report?: TrialBalanceReport };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data?.report) {
        setError(body.error?.message ?? "Could not load trial balance.");
        setReport(null);
        return;
      }
      setReport(body.data.report);
    } catch {
      setError("Could not load trial balance.");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [asOf]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportQuery = useMemo(
    () => ({ asOf: new Date(`${asOf}T23:59:59`).toISOString() }),
    [asOf],
  );

  const rows = report?.rows ?? [];

  return (
    <section className="view active scrollable finance-desk-view" aria-label="Trial balance">
      <AccountingSubNav />
      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Trial balance</h2>
            <p className="muted">Debit and credit balances as of the selected date.</p>
          </div>
          <ExportMenu
            kind="gl_trial_balance"
            queryParams={exportQuery}
            formats={["pdf", "docx", "xlsx"]}
            disabled={loading || rows.length === 0}
          />
        </div>

        <FirmMoneyCallout />

        <div className="filters-row">
          <label>
            As of
            <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
          </label>
        </div>

        {loading ? <p className="muted">Loading trial balance…</p> : null}
        {error ? <p className="error-text">{error}</p> : null}

        {!loading && !error && rows.length === 0 ? (
          <EmptyState
            title="No balances yet"
            detail="Post journal entries to see trial balance totals."
          />
        ) : null}

        {!loading && rows.length > 0 && report ? (
          <>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Account</th>
                    <th>Type</th>
                    <th className="align-right">Debit</th>
                    <th className="align-right">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.code}>
                      <td>{r.code}</td>
                      <td>{r.name}</td>
                      <td>{r.type.replace("_", " ")}</td>
                      <td className="align-right">
                        {r.debitCents ? centsToDisplay(r.debitCents, report.currency) : "—"}
                      </td>
                      <td className="align-right">
                        {r.creditCents ? centsToDisplay(r.creditCents, report.currency) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th colSpan={3}>Totals</th>
                    <th className="align-right">
                      {centsToDisplay(report.totalDebitCents, report.currency)}
                    </th>
                    <th className="align-right">
                      {centsToDisplay(report.totalCreditCents, report.currency)}
                    </th>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
