"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { FinanceKpisPanel } from "@/components/finance/FinanceKpisPanel";
import { FirmMoneyCallout } from "@/components/finance/FirmMoneyCallout";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { centsToDisplay } from "@/lib/billing/money";
import type { FinanceKpis } from "@/lib/repos/finance-kpis";
import type {
  MonthlyFinancePack,
  WeeklyFinancePack,
} from "@/lib/repos/finance-reports";

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

  function exportCsv() {
    if (tab === "weekly") {
      const params = new URLSearchParams({ pack: "weekly", format: "csv", asOf });
      window.location.href = `/api/finance/reports?${params.toString()}`;
    } else {
      const params = new URLSearchParams({
        pack: "monthly",
        format: "csv",
        year: String(periodYear),
        month: String(periodMonth),
      });
      window.location.href = `/api/finance/reports?${params.toString()}`;
    }
  }

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
            <Button size="sm" variant="outline" onClick={() => exportCsv()} disabled={loading}>
              Export CSV
            </Button>
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
                <div className="trust-overview-card panel">
                  <div className="trust-overview-card-label">Business bank (book)</div>
                  <div className="trust-overview-card-balance">
                    {centsToDisplay(weeklyPack.businessCashbook.bookBalanceCents, "USD")}
                  </div>
                  {weeklyPack.businessCashbook.lastRecon ? (
                    <span className="muted" style={{ fontSize: "0.85rem" }}>
                      Last stmt{" "}
                      {centsToDisplay(
                        weeklyPack.businessCashbook.lastRecon.statementBalanceCents,
                        "USD",
                      )}
                    </span>
                  ) : null}
                </div>
              </div>

              <h4 style={{ marginBottom: "0.5rem" }}>Outstanding invoices</h4>
              {weeklyPack.outstandingInvoices.length === 0 ? (
                <EmptyState title="No outstanding fee invoices" />
              ) : (
                <table className="data data-dense">
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Client</th>
                      <th>Due</th>
                      <th>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weeklyPack.outstandingInvoices.slice(0, 25).map((row) => (
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
                      <th>Client</th>
                      <th>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weeklyPack.trustSnapshot.clientBalances.slice(0, 15).map((row) => (
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
                      <th>Type</th>
                      <th>Account</th>
                      <th>Status</th>
                      <th>Variance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyPack.trustRecons.map((r) => (
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
                      <th>Bank</th>
                      <th>Status</th>
                      <th>Variance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyPack.businessBankRecons.map((r) => (
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
                      <th>Date</th>
                      <th>Category</th>
                      <th>Payee</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyPack.expenses.items.map((e) => (
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
                        <th>Description</th>
                        <th>Acquired</th>
                        <th>Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyPack.assets.map((a) => (
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
