"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExportMenu } from "@/components/export/ExportMenu";
import { AccountingSubNav } from "@/components/finance/AccountingSubNav";
import { FirmMoneyCallout } from "@/components/finance/FirmMoneyCallout";
import { centsToDisplay } from "@/lib/billing/money";

type StatementTab = "pl" | "balance_sheet";

type PlReport = {
  from: string;
  to: string;
  currency: string;
  revenue: { rows: { code: string; name: string; amountCents: number }[]; subtotalCents: number };
  directCosts: { rows: { code: string; name: string; amountCents: number }[]; subtotalCents: number };
  grossProfitCents: number;
  operatingExpenses: { rows: { code: string; name: string; amountCents: number }[]; subtotalCents: number };
  netProfitCents: number;
};

type BsReport = {
  asOf: string;
  currency: string;
  assets: { rows: { code: string; name: string; balanceCents: number }[]; subtotalCents: number };
  liabilities: { rows: { code: string; name: string; balanceCents: number }[]; subtotalCents: number };
  equity: { rows: { code: string; name: string; balanceCents: number }[]; subtotalCents: number };
  currentYearEarningsCents: number;
  totalLiabilitiesAndEquityCents: number;
};

function monthStartInput() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
}

function todayInput() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function SectionTable({
  title,
  rows,
  subtotalCents,
  currency,
}: {
  title: string;
  rows: { code: string; name: string; amountCents?: number; balanceCents?: number }[];
  subtotalCents: number;
  currency: string;
}) {
  return (
    <div className="gl-statement-section">
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <p className="muted">No activity in this section.</p>
      ) : (
        <table className="data-table compact">
          <tbody>
            {rows.map((r) => (
              <tr key={r.code}>
                <td>{r.code}</td>
                <td>{r.name}</td>
                <td className="align-right">
                  {centsToDisplay(r.amountCents ?? r.balanceCents ?? 0, currency)}
                </td>
              </tr>
            ))}
            <tr className="subtotal-row">
              <td colSpan={2}>Subtotal</td>
              <td className="align-right">{centsToDisplay(subtotalCents, currency)}</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

export function GlStatementsView() {
  const [tab, setTab] = useState<StatementTab>("pl");
  const [from, setFrom] = useState(monthStartInput);
  const [to, setTo] = useState(todayInput);
  const [asOf, setAsOf] = useState(todayInput);
  const [pl, setPl] = useState<PlReport | null>(null);
  const [bs, setBs] = useState<BsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === "pl") {
        const params = new URLSearchParams({
          kind: "pl",
          from: new Date(`${from}T00:00:00`).toISOString(),
          to: new Date(`${to}T23:59:59`).toISOString(),
        });
        const res = await fetch(`/api/finance/gl/statements?${params}`, { credentials: "include" });
        const body = (await res.json()) as {
          ok?: boolean;
          data?: { report?: PlReport };
          error?: { message: string };
        };
        if (!res.ok || !body.ok || !body.data?.report) {
          setError(body.error?.message ?? "Could not load P&L.");
          setPl(null);
          return;
        }
        setPl(body.data.report);
      } else {
        const params = new URLSearchParams({
          kind: "balance_sheet",
          asOf: new Date(`${asOf}T23:59:59`).toISOString(),
        });
        const res = await fetch(`/api/finance/gl/statements?${params}`, { credentials: "include" });
        const body = (await res.json()) as {
          ok?: boolean;
          data?: { report?: BsReport };
          error?: { message: string };
        };
        if (!res.ok || !body.ok || !body.data?.report) {
          setError(body.error?.message ?? "Could not load balance sheet.");
          setBs(null);
          return;
        }
        setBs(body.data.report);
      }
    } catch {
      setError("Could not load financial statements.");
    } finally {
      setLoading(false);
    }
  }, [tab, from, to, asOf]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportQuery = useMemo(() => {
    if (tab === "pl") {
      return {
        from: new Date(`${from}T00:00:00`).toISOString(),
        to: new Date(`${to}T23:59:59`).toISOString(),
      };
    }
    return { asOf: new Date(`${asOf}T23:59:59`).toISOString() };
  }, [tab, from, to, asOf]);

  return (
    <section className="view active scrollable finance-desk-view" aria-label="Financial statements">
      <AccountingSubNav />
      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Financial statements</h2>
            <p className="muted">Profit and loss with gross profit, and balance sheet as-of date.</p>
          </div>
          <ExportMenu
            kind={tab === "pl" ? "gl_profit_and_loss" : "gl_balance_sheet"}
            queryParams={exportQuery}
            formats={["pdf", "docx", "xlsx"]}
            disabled={loading}
          />
        </div>

        <FirmMoneyCallout />

        <div className="tabs inline-tabs">
          <button
            type="button"
            className={`tab${tab === "pl" ? " active" : ""}`}
            onClick={() => setTab("pl")}
          >
            Profit &amp; loss
          </button>
          <button
            type="button"
            className={`tab${tab === "balance_sheet" ? " active" : ""}`}
            onClick={() => setTab("balance_sheet")}
          >
            Balance sheet
          </button>
        </div>

        {tab === "pl" ? (
          <div className="filters-row">
            <label>
              From
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label>
              To
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
        ) : (
          <div className="filters-row">
            <label>
              As of
              <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
            </label>
          </div>
        )}

        {loading ? <p className="muted">Loading statement…</p> : null}
        {error ? <p className="error-text">{error}</p> : null}

        {!loading && tab === "pl" && pl ? (
          <div className="gl-statements-grid">
            <SectionTable
              title="Revenue"
              rows={pl.revenue.rows}
              subtotalCents={pl.revenue.subtotalCents}
              currency={pl.currency}
            />
            <SectionTable
              title="Direct client costs"
              rows={pl.directCosts.rows}
              subtotalCents={pl.directCosts.subtotalCents}
              currency={pl.currency}
            />
            <p className="summary-line">
              <strong>Gross profit:</strong> {centsToDisplay(pl.grossProfitCents, pl.currency)}
            </p>
            <SectionTable
              title="Operating expenses"
              rows={pl.operatingExpenses.rows}
              subtotalCents={pl.operatingExpenses.subtotalCents}
              currency={pl.currency}
            />
            <p className="summary-line">
              <strong>Net profit:</strong> {centsToDisplay(pl.netProfitCents, pl.currency)}
            </p>
          </div>
        ) : null}

        {!loading && tab === "balance_sheet" && bs ? (
          <div className="gl-statements-grid">
            <SectionTable
              title="Assets"
              rows={bs.assets.rows}
              subtotalCents={bs.assets.subtotalCents}
              currency={bs.currency}
            />
            <SectionTable
              title="Liabilities"
              rows={bs.liabilities.rows}
              subtotalCents={bs.liabilities.subtotalCents}
              currency={bs.currency}
            />
            <SectionTable
              title="Equity"
              rows={bs.equity.rows}
              subtotalCents={bs.equity.subtotalCents}
              currency={bs.currency}
            />
            <p className="summary-line">
              <strong>Current year earnings:</strong>{" "}
              {centsToDisplay(bs.currentYearEarningsCents, bs.currency)}
            </p>
            <p className="summary-line">
              <strong>Total liabilities and equity:</strong>{" "}
              {centsToDisplay(bs.totalLiabilitiesAndEquityCents, bs.currency)}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
