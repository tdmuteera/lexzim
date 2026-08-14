"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { Can } from "@/components/auth/Can";
import { FirmMoneyCallout } from "@/components/finance/FirmMoneyCallout";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { centsToDisplay } from "@/lib/billing/money";

type ExpenseItem = {
  id: string;
  expenseDate: string;
  category: string;
  categoryLabel: string;
  payee: string;
  amountCents: number;
  currency: string;
  matterId: string | null;
  matterTitle: string | null;
  paymentMethod: string | null;
  notes: string | null;
};

type CashbookItem = {
  id: string;
  entryDate: string;
  entryType: string;
  amountCents: number;
  currency: string;
  reference: string | null;
  bankAccountLabel: string | null;
  expenseId: string | null;
  feePaymentId: string | null;
  notes: string | null;
};

type CategoryOption = { id: string; label: string; glAccountId?: string | null };
type MatterOption = { id: string; title: string; matterNumber: string | null };
type FeePaymentOption = {
  id: string;
  amountCents: number;
  currency: string;
  paidAt: string;
  reference: string | null;
};

type Tab = "expenses" | "cashbook" | "recon";

function todayInput() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function ExpensesAndCashbookView() {
  const { user, can } = useAuth();
  const isMp = user?.role?.code === "managing_partner";

  const [tab, setTab] = useState<Tab>("expenses");
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [cashbook, setCashbook] = useState<CashbookItem[]>([]);
  const [bookBalanceCents, setBookBalanceCents] = useState(0);
  const [feePayments, setFeePayments] = useState<FeePaymentOption[]>([]);
  const [matters, setMatters] = useState<MatterOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [expOpen, setExpOpen] = useState(false);
  const [expDate, setExpDate] = useState(todayInput);
  const [expCategory, setExpCategory] = useState("9070");
  const [expBudgetMonth, setExpBudgetMonth] = useState("");
  const [expPaymentSource, setExpPaymentSource] = useState<"cash" | "petty">("cash");
  const [expPayee, setExpPayee] = useState("");
  const [expAmount, setExpAmount] = useState("");
  const [expMatterId, setExpMatterId] = useState("");
  const [expMethod, setExpMethod] = useState("");
  const [expNotes, setExpNotes] = useState("");

  const [cbOpen, setCbOpen] = useState(false);
  const [cbType, setCbType] = useState<"in" | "out">("out");
  const [cbDate, setCbDate] = useState(todayInput);
  const [cbAmount, setCbAmount] = useState("");
  const [cbRef, setCbRef] = useState("");
  const [cbBankLabel, setCbBankLabel] = useState("Business operating account");
  const [cbFeePaymentId, setCbFeePaymentId] = useState("");
  const [cbNotes, setCbNotes] = useState("");

  const now = new Date();
  const [reconYear, setReconYear] = useState(now.getFullYear());
  const [reconMonth, setReconMonth] = useState(now.getMonth() + 1);
  const [reconBankLabel, setReconBankLabel] = useState("Business operating account");
  const [reconStatement, setReconStatement] = useState("");
  const [reconOverride, setReconOverride] = useState("");
  const [reconPreviewBalance, setReconPreviewBalance] = useState<number | null>(null);

  const loadExpenses = useCallback(async () => {
    const res = await fetch("/api/finance/expenses", { credentials: "include" });
    const body = (await res.json()) as {
      ok: boolean;
      data?: { items: ExpenseItem[]; categories: CategoryOption[] };
    };
    if (!res.ok || !body.ok || !body.data) throw new Error("Could not load expenses.");
    setExpenses(body.data.items);
    setCategories(body.data.categories);
    if (body.data.categories[0]) setExpCategory(body.data.categories[0].id);
  }, []);

  const loadCashbook = useCallback(async () => {
    const params = new URLSearchParams();
    if (cbBankLabel) params.set("bankAccountLabel", cbBankLabel);
    const res = await fetch(`/api/finance/cashbook?${params}`, { credentials: "include" });
    const body = (await res.json()) as {
      ok: boolean;
      data?: {
        items: CashbookItem[];
        bookBalanceCents: number;
        feePayments: FeePaymentOption[];
      };
    };
    if (!res.ok || !body.ok || !body.data) throw new Error("Could not load cashbook.");
    setCashbook(body.data.items);
    setBookBalanceCents(body.data.bookBalanceCents);
    setFeePayments(body.data.feePayments);
  }, [cbBankLabel]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await loadExpenses();
      await loadCashbook();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load.");
    } finally {
      setLoading(false);
    }
  }, [loadExpenses, loadCashbook]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/matters?bucket=all", { credentials: "include" });
        const body = (await res.json()) as { data?: { items?: MatterOption[] } };
        if (!cancelled && res.ok && body.data?.items) setMatters(body.data.items);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (tab !== "recon") return;
    const params = new URLSearchParams({
      preview: "1",
      reconType: "business_bank",
      bankAccountLabel: reconBankLabel,
      periodYear: String(reconYear),
      periodMonth: String(reconMonth),
    });
    if (reconStatement) params.set("statementDollars", reconStatement);
    void fetch(`/api/finance/reconciliations?${params}`, { credentials: "include" })
      .then((res) => res.json())
      .then((body: { ok?: boolean; data?: { preview?: { accountBookBalanceCents: number } } }) => {
        if (body.ok && body.data?.preview) {
          setReconPreviewBalance(body.data.preview.accountBookBalanceCents);
        }
      });
  }, [tab, reconBankLabel, reconYear, reconMonth, reconStatement]);

  async function submitExpense(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/finance/expenses", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expenseDate: new Date(`${expDate}T12:00:00`).toISOString(),
          category: expCategory,
          payee: expPayee,
          amountDollars: expAmount,
          matterId: expMatterId || null,
          paymentMethod: expMethod || null,
          notes: expNotes || null,
          paymentSource: expPaymentSource,
          budgetMonth: expBudgetMonth || null,
          glAccountId:
            categories.find((c) => c.id === expCategory)?.glAccountId ?? null,
        }),
      });
      const body = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not save expense.");
        return;
      }
      setExpOpen(false);
      setExpPayee("");
      setExpAmount("");
      await load();
    } catch {
      setError("Could not save expense.");
    } finally {
      setSaving(false);
    }
  }

  async function submitCashbook(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/finance/cashbook", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryDate: new Date(`${cbDate}T12:00:00`).toISOString(),
          entryType: cbType,
          amountDollars: cbAmount,
          reference: cbRef || null,
          bankAccountLabel: cbBankLabel || null,
          feePaymentId: cbType === "in" && cbFeePaymentId ? cbFeePaymentId : null,
          notes: cbNotes || null,
        }),
      });
      const body = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not save cashbook entry.");
        return;
      }
      setCbOpen(false);
      setCbAmount("");
      setCbRef("");
      await load();
    } catch {
      setError("Could not save cashbook entry.");
    } finally {
      setSaving(false);
    }
  }

  async function saveBusinessRecon(complete: boolean) {
    if (!reconStatement) {
      setError("Enter statement balance.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const createRes = await fetch("/api/finance/reconciliations", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reconType: "business_bank",
          periodYear: reconYear,
          periodMonth: reconMonth,
          bankAccountLabel: reconBankLabel,
          statementDollars: reconStatement,
        }),
      });
      const createBody = (await createRes.json()) as {
        ok: boolean;
        data?: { run: { id: string } };
        error?: { message: string };
      };
      if (!createRes.ok || !createBody.ok || !createBody.data) {
        setError(createBody.error?.message ?? "Could not save reconciliation.");
        return;
      }
      if (complete) {
        const id = createBody.data.run.id;
        const completeRes = await fetch(`/api/finance/reconciliations/${id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "complete",
            overrideReason: reconOverride || null,
          }),
        });
        const completeBody = (await completeRes.json()) as { ok: boolean; error?: { message: string } };
        if (!completeRes.ok || !completeBody.ok) {
          setError(completeBody.error?.message ?? "Could not complete reconciliation.");
          return;
        }
      }
      setReconStatement("");
      setReconOverride("");
    } catch {
      setError("Could not save reconciliation.");
    } finally {
      setSaving(false);
    }
  }

  const reconVariance =
    reconStatement && reconPreviewBalance !== null
      ? Math.round(Number(reconStatement) * 100) - reconPreviewBalance
      : null;
  const currency = expenses[0]?.currency ?? "USD";

  return (
    <section className="view active scrollable finance-desk-view" aria-label="Expenses and cashbook">
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Expenses & cashbook</h3>
            <p className="panel-subtitle muted">Firm operating money · not trust</p>
          </div>
        </div>
        <div className="panel-body">
          <FirmMoneyCallout />

          <div className="toolbar" style={{ marginBottom: "0.75rem" }}>
            <Button size="sm" variant={tab === "expenses" ? "primary" : "outline"} onClick={() => setTab("expenses")}>
              Expenses
            </Button>
            <Button size="sm" variant={tab === "cashbook" ? "primary" : "outline"} onClick={() => setTab("cashbook")}>
              Cashbook
            </Button>
            <Button size="sm" variant={tab === "recon" ? "primary" : "outline"} onClick={() => setTab("recon")}>
              Business bank recon
            </Button>
            <span className="toolbar-spacer" />
            <Button size="sm" variant="outline" onClick={() => load()} disabled={loading}>
              Refresh
            </Button>
          </div>

          {error ? (
            <p role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem" }}>{error}</p>
          ) : null}

          {tab === "expenses" ? (
            <>
              <Can permission="finance.post">
                <Button size="sm" onClick={() => setExpOpen(true)} style={{ marginBottom: "0.75rem" }}>
                  New expense
                </Button>
              </Can>
              {expOpen ? (
                <form onSubmit={submitExpense} className="panel" style={{ padding: "1rem", marginBottom: "1rem" }}>
                  <h4 style={{ marginTop: 0 }}>Record expense</h4>
                  <div className="grid-2">
                    <div className="form-group">
                      <label>Date</label>
                      <input type="date" value={expDate} onChange={(e) => setExpDate(e.target.value)} required />
                    </div>
                    <div className="form-group">
                      <label>Category</label>
                      <select value={expCategory} onChange={(e) => setExpCategory(e.target.value)}>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>{c.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="grid-2">
                    <div className="form-group">
                      <label>Payee</label>
                      <input value={expPayee} onChange={(e) => setExpPayee(e.target.value)} required />
                    </div>
                    <div className="form-group">
                      <label>Amount</label>
                      <input type="number" min={0.01} step="0.01" value={expAmount} onChange={(e) => setExpAmount(e.target.value)} required />
                    </div>
                  </div>
                  <div className="grid-2">
                    <div className="form-group">
                      <label>Matter (optional)</label>
                      <select value={expMatterId} onChange={(e) => setExpMatterId(e.target.value)}>
                        <option value="">None</option>
                        {matters.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.matterNumber ? `${m.matterNumber} · ${m.title}` : m.title}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Payment method</label>
                      <input value={expMethod} onChange={(e) => setExpMethod(e.target.value)} placeholder="EFT, card…" />
                    </div>
                  </div>
                  <div className="grid-2">
                    <div className="form-group">
                      <label>Paid from</label>
                      <select
                        value={expPaymentSource}
                        onChange={(e) =>
                          setExpPaymentSource(e.target.value as "cash" | "petty")
                        }
                      >
                        <option value="cash">Business bank (1010)</option>
                        <option value="petty">Petty cash (1050)</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Budget month (optional)</label>
                      <input
                        type="month"
                        value={expBudgetMonth}
                        onChange={(e) => setExpBudgetMonth(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Notes</label>
                    <input value={expNotes} onChange={(e) => setExpNotes(e.target.value)} />
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <Button type="submit" size="sm" disabled={saving}>Save</Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setExpOpen(false)}>Cancel</Button>
                  </div>
                </form>
              ) : null}
              {!expenses.length ? (
                <EmptyState title="No expenses" detail="Record firm operating costs here." />
              ) : (
                <table className="data data-dense">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Category</th>
                      <th>Payee</th>
                      <th>Matter</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.map((row) => (
                      <tr key={row.id}>
                        <td>{new Date(row.expenseDate).toLocaleDateString()}</td>
                        <td>{row.categoryLabel}</td>
                        <td>{row.payee}</td>
                        <td>
                          {row.matterId ? (
                            <Link href={`/matters/${row.matterId}`}>{row.matterTitle ?? row.matterId}</Link>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>{centsToDisplay(row.amountCents, row.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          ) : null}

          {tab === "cashbook" ? (
            <>
              <div className="trust-overview-card panel" style={{ marginBottom: "1rem", maxWidth: "280px" }}>
                <div className="trust-overview-card-label">Book balance</div>
                <div className="trust-overview-card-balance">
                  {centsToDisplay(bookBalanceCents, currency)}
                </div>
                <div className="muted" style={{ fontSize: "0.75rem" }}>{cbBankLabel}</div>
              </div>
              <Can permission="finance.post">
                <Button size="sm" onClick={() => setCbOpen(true)} style={{ marginBottom: "0.75rem" }}>
                  New cashbook line
                </Button>
              </Can>
              {cbOpen ? (
                <form onSubmit={submitCashbook} className="panel" style={{ padding: "1rem", marginBottom: "1rem" }}>
                  <h4 style={{ marginTop: 0 }}>Cashbook entry</h4>
                  <div className="grid-2">
                    <div className="form-group">
                      <label>Type</label>
                      <select value={cbType} onChange={(e) => setCbType(e.target.value as "in" | "out")}>
                        <option value="in">Money in</option>
                        <option value="out">Money out</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Date</label>
                      <input type="date" value={cbDate} onChange={(e) => setCbDate(e.target.value)} required />
                    </div>
                  </div>
                  <div className="grid-2">
                    <div className="form-group">
                      <label>Amount</label>
                      <input type="number" min={0.01} step="0.01" value={cbAmount} onChange={(e) => setCbAmount(e.target.value)} required />
                    </div>
                    <div className="form-group">
                      <label>Bank account label</label>
                      <input value={cbBankLabel} onChange={(e) => setCbBankLabel(e.target.value)} />
                    </div>
                  </div>
                  {cbType === "in" ? (
                    <div className="form-group">
                      <label>Link fee payment (optional)</label>
                      <select value={cbFeePaymentId} onChange={(e) => setCbFeePaymentId(e.target.value)}>
                        <option value="">None</option>
                        {feePayments.map((fp) => (
                          <option key={fp.id} value={fp.id}>
                            {centsToDisplay(fp.amountCents, fp.currency)} · {new Date(fp.paidAt).toLocaleDateString()}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  <div className="form-group">
                    <label>Reference</label>
                    <input value={cbRef} onChange={(e) => setCbRef(e.target.value)} />
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <Button type="submit" size="sm" disabled={saving}>Save</Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setCbOpen(false)}>Cancel</Button>
                  </div>
                </form>
              ) : null}
              {!cashbook.length ? (
                <EmptyState title="No cashbook lines" detail="Record firm money in and out." />
              ) : (
                <table className="data data-dense">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Amount</th>
                      <th>Reference</th>
                      <th>Links</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cashbook.map((row) => (
                      <tr key={row.id}>
                        <td>{new Date(row.entryDate).toLocaleDateString()}</td>
                        <td>
                          <Badge tone={row.entryType === "in" ? "open" : "default"}>{row.entryType}</Badge>
                        </td>
                        <td>{centsToDisplay(row.amountCents, row.currency)}</td>
                        <td>{row.reference ?? "—"}</td>
                        <td className="muted" style={{ fontSize: "0.75rem" }}>
                          {row.feePaymentId ? "Fee payment" : row.expenseId ? "Expense" : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          ) : null}

          {tab === "recon" ? (
            <div className="panel" style={{ padding: "1rem" }}>
              <h4 style={{ marginTop: 0 }}>Business bank reconciliation (lite)</h4>
              <p className="muted" style={{ fontSize: "0.8rem" }}>
                Enter closing statement balance vs cashbook book balance for the operating account.
              </p>
              <div className="grid-2">
                <div className="form-group">
                  <label>Period month</label>
                  <input type="number" min={1} max={12} value={reconMonth} onChange={(e) => setReconMonth(Number(e.target.value))} />
                </div>
                <div className="form-group">
                  <label>Year</label>
                  <input type="number" value={reconYear} onChange={(e) => setReconYear(Number(e.target.value))} />
                </div>
              </div>
              <div className="form-group">
                <label>Bank account label</label>
                <input value={reconBankLabel} onChange={(e) => setReconBankLabel(e.target.value)} />
              </div>
              {reconPreviewBalance !== null ? (
                <p>
                  Book balance: <strong>{centsToDisplay(reconPreviewBalance, currency)}</strong>
                </p>
              ) : null}
              <div className="form-group">
                <label>Statement closing balance</label>
                <input type="number" step="0.01" value={reconStatement} onChange={(e) => setReconStatement(e.target.value)} />
              </div>
              {reconVariance !== null ? (
                <div className={reconVariance !== 0 ? "finance-overdue-banner" : "recon-variance-ok"}>
                  Variance: <strong>{centsToDisplay(reconVariance, currency)}</strong>
                </div>
              ) : null}
              {reconVariance !== 0 && reconVariance !== null ? (
                <div className="form-group">
                  <label>MP override reason (if completing with variance)</label>
                  <input value={reconOverride} onChange={(e) => setReconOverride(e.target.value)} disabled={!isMp} />
                </div>
              ) : null}
              <Can permission="finance.post">
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <Button size="sm" disabled={saving || !can("finance.reconcile")} onClick={() => void saveBusinessRecon(false)}>
                    Save draft
                  </Button>
                  <Button size="sm" variant="outline" disabled={saving || !can("finance.reconcile")} onClick={() => void saveBusinessRecon(true)}>
                    Mark completed
                  </Button>
                </div>
              </Can>
              {!can("finance.reconcile") ? (
                <p className="muted" style={{ fontSize: "0.8rem" }}>
                  Reconciliation sign-off requires <code>finance.reconcile</code>.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
