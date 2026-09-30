"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { FinanceKpisPanel } from "@/components/finance/FinanceKpisPanel";
import { FirmMoneyCallout } from "@/components/finance/FirmMoneyCallout";
import { ExportMenu } from "@/components/export/ExportMenu";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SortableTh } from "@/components/ui/SortableTh";
import { centsToDisplay } from "@/lib/billing/money";
import type { FinanceKpis } from "@/lib/repos/finance-kpis";
import type {
  FirmAssetRow,
  MonthlyFinancePack,
  OutstandingInvoiceRow,
  ReconRunSummary,
  WeeklyFinancePack,
} from "@/lib/repos/finance-reports";
import type { TrustClientBalanceRow } from "@/lib/repos/trust";
import { useTableSort } from "@/lib/ui/table-sort";

type Tab = "weekly" | "monthly" | "kpis";

function todayInput() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatShortDate(value: string | null) {
  if (!value) return "n/a";
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function periodLabel(year: number, month: number) {
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

export function FinanceReportsView() {
  const { can } = useAuth();
  const canCloseMonth = can("finance.close_month");

  const now = new Date();
  const [tab, setTab] = useState<Tab>("weekly");
  const [asOf, setAsOf] = useState(todayInput);
  const [periodYear, setPeriodYear] = useState(now.getFullYear());
  const [periodMonth, setPeriodMonth] = useState(now.getMonth() + 1);

  const [weeklyPack, setWeeklyPack] = useState<WeeklyFinancePack | null>(null);
  const [monthlyPack, setMonthlyPack] = useState<MonthlyFinancePack | null>(null);
  const [kpis, setKpis] = useState<FinanceKpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locking, setLocking] = useState(false);

  const loadWeekly = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ pack: "weekly", asOf });
      const res = await fetch(`/api/finance/reports?${params.toString()}`, {
        credentials: "include",
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { pack: WeeklyFinancePack };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Could not load weekly pack.");
        setWeeklyPack(null);
        return;
      }
      setWeeklyPack(body.data.pack);
    } catch {
      setError("Could not load weekly pack.");
      setWeeklyPack(null);
    } finally {
      setLoading(false);
    }
  }, [asOf]);

  const loadMonthly = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        pack: "monthly",
        year: String(periodYear),
        month: String(periodMonth),
      });
      const res = await fetch(`/api/finance/reports?${params.toString()}`, {
        credentials: "include",
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { pack: MonthlyFinancePack };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Could not load monthly pack.");
        setMonthlyPack(null);
        return;
      }
      setMonthlyPack(body.data.pack);
    } catch {
      setError("Could not load monthly pack.");
      setMonthlyPack(null);
    } finally {
      setLoading(false);
    }
  }, [periodYear, periodMonth]);

  const loadKpis = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        year: String(periodYear),
        month: String(periodMonth),
      });
      const res = await fetch(`/api/finance/kpis?${params.toString()}`, {
        credentials: "include",
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { kpis: FinanceKpis };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Could not load finance KPIs.");
        setKpis(null);
        return;
      }
      setKpis(body.data.kpis);
    } catch {
      setError("Could not load finance KPIs.");
      setKpis(null);
    } finally {
      setLoading(false);
    }
  }, [periodYear, periodMonth]);

  useEffect(() => {
    if (tab === "weekly") void loadWeekly();
    else if (tab === "monthly") void loadMonthly();
    else void loadKpis();
  }, [tab, loadWeekly, loadMonthly, loadKpis]);

  async function lockPeriod() {
    if (!canCloseMonth || monthlyPack?.periodLock.locked) return;
    setLocking(true);
    setError(null);
    try {
      const res = await fetch("/api/finance/period-locks", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: periodYear, month: periodMonth }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not lock period.");
        return;
      }
      await loadMonthly();
    } catch {
      setError("Could not lock period.");
    } finally {
      setLocking(false);
    }
  }

  const trustBankTotal =
    weeklyPack?.trustSnapshot.accounts
      .filter((a) => a.accountKind === "bank")
      .reduce((sum, a) => sum + a.balanceCents, 0) ?? 0;
  const trustVaultTotal =
    weeklyPack?.trustSnapshot.accounts
      .filter((a) => a.accountKind === "vault")
      .reduce((sum, a) => sum + a.balanceCents, 0) ?? 0;

  const outstandingInvoices = weeklyPack?.outstandingInvoices ?? [];
  const outstandingAccessors = useMemo(
    () => ({
      invoice: (r: OutstandingInvoiceRow) => r.invoiceNumber,
      client: (r: OutstandingInvoiceRow) => r.clientName,
      due: (r: OutstandingInvoiceRow) => r.dueDate,
      balance: (r: OutstandingInvoiceRow) => r.balanceCents,
    }),
    [],
  );
  const {
    sortedRows: sortedOutstanding,
    sortKey: outKey,
    sortDir: outDir,
    toggleSort: toggleOut,
  } = useTableSort(outstandingInvoices, outstandingAccessors, { key: "due", dir: "asc" });

  const clientBalances = weeklyPack?.trustSnapshot.clientBalances ?? [];
  const balAccessors = useMemo(
    () => ({
      client: (r: TrustClientBalanceRow) => r.clientName,
      balance: (r: TrustClientBalanceRow) => r.balanceCents,
    }),
    [],
  );
  const {
    sortedRows: sortedBalances,
    sortKey: balKey,
    sortDir: balDir,
    toggleSort: toggleBal,
  } = useTableSort(clientBalances, balAccessors, { key: "client", dir: "asc" });

  const trustRecons = monthlyPack?.trustRecons ?? [];
  const trustReconAccessors = useMemo(
    () => ({
      type: (r: ReconRunSummary) => r.reconType,
      account: (r: ReconRunSummary) => r.trustAccountName ?? "",
      status: (r: ReconRunSummary) => r.status,
      variance: (r: ReconRunSummary) => r.varianceCents,
    }),
    [],
  );
  const {
    sortedRows: sortedTrustRecons,
    sortKey: trKey,
    sortDir: trDir,
    toggleSort: toggleTr,
  } = useTableSort(trustRecons, trustReconAccessors, { key: "type", dir: "asc" });

  const businessRecons = monthlyPack?.businessBankRecons ?? [];
  const bizReconAccessors = useMemo(
    () => ({
      bank: (r: ReconRunSummary) => r.bankAccountLabel ?? "",
      status: (r: ReconRunSummary) => r.status,
      variance: (r: ReconRunSummary) => r.varianceCents,
    }),
    [],
  );
  const {
    sortedRows: sortedBizRecons,
    sortKey: bizKey,
    sortDir: bizDir,
    toggleSort: toggleBiz,
  } = useTableSort(businessRecons, bizReconAccessors, { key: "bank", dir: "asc" });

  type ExpenseItem = MonthlyFinancePack["expenses"]["items"][number];
  const expenses = monthlyPack?.expenses.items ?? [];
  const expenseAccessors = useMemo(
    () => ({
      date: (r: ExpenseItem) => r.expenseDate,
      category: (r: ExpenseItem) => r.categoryLabel,
      payee: (r: ExpenseItem) => r.payee,
      amount: (r: ExpenseItem) => r.amountCents,
    }),
    [],
  );
  const {
    sortedRows: sortedExpenses,
    sortKey: expKey,
    sortDir: expDir,
    toggleSort: toggleExp,
  } = useTableSort(expenses, expenseAccessors, { key: "date", dir: "desc" });

  const assets = monthlyPack?.assets ?? [];
  const assetAccessors = useMemo(
    () => ({
      description: (r: FirmAssetRow) => r.description,
      acquired: (r: FirmAssetRow) => r.acquiredDate,
      cost: (r: FirmAssetRow) => r.costCents,
    }),
    [],
  );
  const {
    sortedRows: sortedAssets,
    sortKey: assetKey,
    sortDir: assetDir,
    toggleSort: toggleAsset,
  } = useTableSort(assets, assetAccessors, { key: "description", dir: "asc" });

  return (
    <section className="view active scrollable finance-desk-view" aria-label="Finance reports">
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Finance reports</h3>
            <p className="panel-subtitle muted">
              Weekly collections pack · monthly close · simple P&amp;L
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
            {tab === "weekly" ? (
              <ExportMenu
                kind="finance_weekly"
                queryParams={{ asOf }}
                disabled={loading}
              />
            ) : null}
            {tab === "monthly" ? (
              <ExportMenu
                kind="finance_monthly"
                queryParams={{
                  year: String(periodYear),
                  month: String(periodMonth),
                }}
                disabled={loading}
              />
            ) : null}
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                tab === "weekly"
                  ? loadWeekly()
                  : tab === "monthly"
                    ? loadMonthly()
                    : loadKpis()
              }
              disabled={loading}
            >
              Refresh
            </Button>
          </div>
        </div>

        <div className="panel-body">
          <FirmMoneyCallout />

          <div className="toolbar" style={{ marginBottom: "1rem" }}>
            <button
              type="button"
              className={`tab-btn${tab === "weekly" ? " active" : ""}`}
              onClick={() => setTab("weekly")}
            >
              Weekly pack
            </button>
            <button
              type="button"
              className={`tab-btn${tab === "monthly" ? " active" : ""}`}
              onClick={() => setTab("monthly")}
            >
              Monthly close
            </button>
            <button
              type="button"
              className={`tab-btn${tab === "kpis" ? " active" : ""}`}
              onClick={() => setTab("kpis")}
            >
              Finance KPIs
            </button>
          </div>

          {tab === "weekly" ? (
            <div className="toolbar">
              <label className="filter-label">
                As of
                <input
                  type="date"
                  className="filter-input"
                  value={asOf}
                  onChange={(e) => setAsOf(e.target.value)}
                />
              </label>
            </div>
          ) : (
            <div className="toolbar">
              <label className="filter-label">
                Year
                <input
                  type="number"
                  className="filter-input"
                  min={2000}
                  max={2100}
                  value={periodYear}
                  onChange={(e) => setPeriodYear(Number(e.target.value))}
                />
              </label>
              <label className="filter-label">
                Month
                <select
                  className="filter-select"
                  value={periodMonth}
                  onChange={(e) => setPeriodMonth(Number(e.target.value))}
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      {new Date(2000, m - 1, 1).toLocaleString(undefined, { month: "long" })}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {error ? (
            <p className="form-error" role="alert">{error}</p>
          ) : null}

          {loading ? (
            <p className="muted">Loading report pack…</p>
          ) : tab === "weekly" && weeklyPack ? (
            <div className="finance-reports-weekly">
              <div className="trust-overview-cards" style={{ marginBottom: "1.25rem" }}>
                <div className="trust-overview-card panel">
                  <div className="trust-overview-card-label">Fee debtors</div>
                  <div className="trust-overview-card-balance">
                    {weeklyPack.debtors.summaryByCurrency[0]
                      ? centsToDisplay(
                          weeklyPack.debtors.summaryByCurrency[0].totalBalanceCents,
                          weeklyPack.debtors.summaryByCurrency[0].currency,
                        )
                      : "—"}
                  </div>
                  <Link href="/finance/debtors" className="muted" style={{ fontSize: "0.85rem" }}>
                    Open debtors desk
                  </Link>
                </div>
                <div className="trust-overview-card panel">
                  <div className="trust-overview-card-label">Trust bank</div>
                  <div className="trust-overview-card-balance">
                    {centsToDisplay(trustBankTotal, "USD")}
                  </div>
                  <Link href="/finance/trust" className="muted" style={{ fontSize: "0.85rem" }}>
                    Trust desk
                  </Link>
                </div>
                <div className="trust-overview-card panel">
                  <div className="trust-overview-card-label">Trust vault</div>
                  <div className="trust-overview-card-balance">
                    {centsToDisplay(trustVaultTotal, "USD")}
                  </div>
                </div>
                {(weeklyPack.firmCash ?? []).map((p) => (
                  <div key={p.code} className="trust-overview-card panel">
                    <div className="trust-overview-card-label">{p.label}</div>
                    <div className="trust-overview-card-balance">{centsToDisplay(p.balanceCents, "USD")}</div>
                    {p.code === "1010" && weeklyPack.businessCashbook.lastRecon ? (
                      <span className="muted" style={{ fontSize: "0.85rem" }}>
                        Last stmt{" "}
                        {centsToDisplay(weeklyPack.businessCashbook.lastRecon.statementBalanceCents, "USD")}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>

              <h4 style={{ marginBottom: "0.5rem" }}>Outstanding invoices</h4>
              {weeklyPack.outstandingInvoices.length === 0 ? (
                <EmptyState title="No outstanding fee invoices" />
              ) : (
                <table className="data data-dense">
                  <thead>
                    <tr>
                      <SortableTh label="Invoice" columnKey="invoice" activeKey={outKey} direction={outDir} onSort={toggleOut} />
                      <SortableTh label="Client" columnKey="client" activeKey={outKey} direction={outDir} onSort={toggleOut} />
                      <SortableTh label="Due" columnKey="due" activeKey={outKey} direction={outDir} onSort={toggleOut} />
                      <SortableTh label="Balance" columnKey="balance" activeKey={outKey} direction={outDir} onSort={toggleOut} />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedOutstanding.slice(0, 25).map((row) => (
                      <tr key={row.invoiceId}>
                        <td>{row.invoiceNumber}</td>
                        <td>{row.clientName}</td>
                        <td>{formatShortDate(row.dueDate)}</td>
                        <td>{centsToDisplay(row.balanceCents, row.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {weeklyPack.outstandingInvoices.length > 25 ? (
                <p className="muted" style={{ marginTop: "0.5rem" }}>
                  Showing 25 of {weeklyPack.outstandingInvoices.length}. Export CSV for full list.
                </p>
              ) : null}

              <h4 style={{ marginTop: "1.5rem", marginBottom: "0.5rem" }}>Client trust balances</h4>
              {weeklyPack.trustSnapshot.clientBalances.length === 0 ? (
                <p className="muted">No client trust balances.</p>
              ) : (
                <table className="data data-dense">
                  <thead>
                    <tr>
                      <SortableTh label="Client" columnKey="client" activeKey={balKey} direction={balDir} onSort={toggleBal} />
                      <SortableTh label="Balance" columnKey="balance" activeKey={balKey} direction={balDir} onSort={toggleBal} />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedBalances.slice(0, 15).map((row) => (
                      <tr key={`${row.clientId}-${row.currency}`}>
                        <td>{row.clientName}</td>
                        <td>{centsToDisplay(row.balanceCents, row.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : tab === "monthly" && monthlyPack ? (
            <div className="finance-reports-monthly">
              <div
                className="panel"
                style={{
                  marginBottom: "1.25rem",
                  padding: "1rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "0.75rem",
                }}
              >
                <div>
                  <strong>{periodLabel(periodYear, periodMonth)}</strong>
                  {monthlyPack.periodLock.locked ? (
                    <Badge tone="open" style={{ marginLeft: "0.5rem" }}>
                      Locked
                    </Badge>
                  ) : (
                    <Badge tone="pending" style={{ marginLeft: "0.5rem" }}>
                      Open
                    </Badge>
                  )}
                  {monthlyPack.periodLock.locked ? (
                    <p className="muted" style={{ marginTop: "0.25rem", fontSize: "0.85rem" }}>
                      Locked {formatShortDate(monthlyPack.periodLock.lockedAt)} by{" "}
                      {monthlyPack.periodLock.lockedByName ?? "staff"}
                    </p>
                  ) : null}
                </div>
                {canCloseMonth && !monthlyPack.periodLock.locked ? (
                  <Button size="sm" onClick={() => lockPeriod()} disabled={locking}>
                    {locking ? "Locking…" : "Lock period"}
                  </Button>
                ) : null}
              </div>

              <div className="trust-overview-cards" style={{ marginBottom: "1.25rem" }}>
                <div className="trust-overview-card panel">
                  <div className="trust-overview-card-label">Fee income (received)</div>
                  <div className="trust-overview-card-balance">
                    {centsToDisplay(
                      monthlyPack.profitAndLoss.feeIncomeCents,
                      monthlyPack.profitAndLoss.currency,
                    )}
                  </div>
                  <span className="muted" style={{ fontSize: "0.85rem" }}>
                    {monthlyPack.profitAndLoss.feePaymentCount} payment
                    {monthlyPack.profitAndLoss.feePaymentCount === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="trust-overview-card panel">
                  <div className="trust-overview-card-label">Expenses</div>
                  <div className="trust-overview-card-balance">
                    {centsToDisplay(
                      monthlyPack.profitAndLoss.expenseTotalCents,
                      monthlyPack.profitAndLoss.currency,
                    )}
                  </div>
                </div>
                <div className="trust-overview-card panel">
                  <div className="trust-overview-card-label">Profit</div>
                  <div className="trust-overview-card-balance">
                    {centsToDisplay(
                      monthlyPack.profitAndLoss.profitCents,
                      monthlyPack.profitAndLoss.currency,
                    )}
                  </div>
                </div>
              </div>

              <p className="muted finance-aging-note" style={{ marginBottom: "1rem" }}>
                {monthlyPack.profitAndLoss.note}
              </p>

              <h4 style={{ marginBottom: "0.5rem" }}>Trust reconciliations</h4>
              {monthlyPack.trustRecons.length === 0 ? (
                <p className="muted">
                  No trust recon runs for this month.{" "}
                  <Link href="/finance/reconciliations">Reconciliations</Link>
                </p>
              ) : (
                <table className="data data-dense">
                  <thead>
                    <tr>
                      <SortableTh label="Type" columnKey="type" activeKey={trKey} direction={trDir} onSort={toggleTr} />
                      <SortableTh label="Account" columnKey="account" activeKey={trKey} direction={trDir} onSort={toggleTr} />
                      <SortableTh label="Status" columnKey="status" activeKey={trKey} direction={trDir} onSort={toggleTr} />
                      <SortableTh label="Variance" columnKey="variance" activeKey={trKey} direction={trDir} onSort={toggleTr} />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedTrustRecons.map((r) => (
                      <tr key={r.id}>
                        <td>{r.reconType}</td>
                        <td>{r.trustAccountName ?? "—"}</td>
                        <td>
                          <Badge tone={r.status === "completed" ? "open" : "pending"}>
                            {r.status}
                          </Badge>
                        </td>
                        <td>{centsToDisplay(r.varianceCents, "USD")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <h4 style={{ marginTop: "1.5rem", marginBottom: "0.5rem" }}>
                Business bank reconciliations
              </h4>
              {monthlyPack.businessBankRecons.length === 0 ? (
                <p className="muted">No business bank recon runs for this month.</p>
              ) : (
                <table className="data data-dense">
                  <thead>
                    <tr>
                      <SortableTh label="Bank" columnKey="bank" activeKey={bizKey} direction={bizDir} onSort={toggleBiz} />
                      <SortableTh label="Status" columnKey="status" activeKey={bizKey} direction={bizDir} onSort={toggleBiz} />
                      <SortableTh label="Variance" columnKey="variance" activeKey={bizKey} direction={bizDir} onSort={toggleBiz} />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedBizRecons.map((r) => (
                      <tr key={r.id}>
                        <td>{r.bankAccountLabel ?? "—"}</td>
                        <td>
                          <Badge tone={r.status === "completed" ? "open" : "pending"}>
                            {r.status}
                          </Badge>
                        </td>
                        <td>{centsToDisplay(r.varianceCents, "USD")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <h4 style={{ marginTop: "1.5rem", marginBottom: "0.5rem" }}>Expenses</h4>
              {monthlyPack.expenses.items.length === 0 ? (
                <EmptyState title="No expenses this month" />
              ) : (
                <table className="data data-dense">
                  <thead>
                    <tr>
                      <SortableTh label="Date" columnKey="date" activeKey={expKey} direction={expDir} onSort={toggleExp} />
                      <SortableTh label="Category" columnKey="category" activeKey={expKey} direction={expDir} onSort={toggleExp} />
                      <SortableTh label="Payee" columnKey="payee" activeKey={expKey} direction={expDir} onSort={toggleExp} />
                      <SortableTh label="Amount" columnKey="amount" activeKey={expKey} direction={expDir} onSort={toggleExp} />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedExpenses.map((e) => (
                      <tr key={e.id}>
                        <td>{formatShortDate(e.expenseDate)}</td>
                        <td>{e.categoryLabel}</td>
                        <td>{e.payee}</td>
                        <td>{centsToDisplay(e.amountCents, e.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {monthlyPack.assets.length > 0 ? (
                <>
                  <h4 style={{ marginTop: "1.5rem", marginBottom: "0.5rem" }}>Asset register</h4>
                  <table className="data data-dense">
                    <thead>
                      <tr>
                        <SortableTh label="Description" columnKey="description" activeKey={assetKey} direction={assetDir} onSort={toggleAsset} />
                        <SortableTh label="Acquired" columnKey="acquired" activeKey={assetKey} direction={assetDir} onSort={toggleAsset} />
                        <SortableTh label="Cost" columnKey="cost" activeKey={assetKey} direction={assetDir} onSort={toggleAsset} />
                      </tr>
                    </thead>
                    <tbody>
                      {sortedAssets.map((a) => (
                        <tr key={a.id}>
                          <td>{a.description}</td>
                          <td>{formatShortDate(a.acquiredDate)}</td>
                          <td>{centsToDisplay(a.costCents, a.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : null}
            </div>
          ) : tab === "kpis" && kpis ? (
            <FinanceKpisPanel kpis={kpis} />
          ) : null}
        </div>
      </div>
    </section>
  );
}
