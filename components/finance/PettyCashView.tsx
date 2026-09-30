"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Can } from "@/components/auth/Can";
import { ExportMenu } from "@/components/export/ExportMenu";
import { CashAccountLedger } from "@/components/finance/CashAccountLedger";
import { FirmMoneyCallout } from "@/components/finance/FirmMoneyCallout";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { centsToDisplay, dollarsToCents } from "@/lib/billing/money";

type CategoryOption = { code: string; label: string };

function todayInput() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Petty cash (GL 1050): topped up from the Business Cash Book via Funds Transfer, spent as firm expenses. */
export function PettyCashView() {
  const { user } = useAuth();
  const { toast } = useToast();
  const currency = user?.firm?.defaultCurrency || "USD";

  const [refreshKey, setRefreshKey] = useState(0);
  const [balanceCents, setBalanceCents] = useState<number | null>(null);
  const [categories, setCategories] = useState<CategoryOption[]>([]);

  const [spendOpen, setSpendOpen] = useState(false);
  const [category, setCategory] = useState("");
  const [payee, setPayee] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayInput);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/finance/expenses/categories", { credentials: "include" });
        const body = (await res.json().catch(() => ({}))) as { ok?: boolean; data?: { items?: CategoryOption[] } };
        if (body.ok && body.data?.items) {
          setCategories(body.data.items);
          setCategory((c) => c || body.data?.items?.[0]?.code || "");
        }
      } catch {
        /* category list is optional until the form opens */
      }
    })();
  }, []);

  const onBalance = useCallback((cents: number) => setBalanceCents(cents), []);

  async function submitSpend(e: FormEvent) {
    e.preventDefault();
    const amountCents = dollarsToCents(amount);
    if (amountCents == null || amountCents < 1) {
      setError("Enter an amount greater than zero.");
      return;
    }
    if (balanceCents != null && amountCents > balanceCents) {
      setError(`Petty cash holds ${centsToDisplay(balanceCents, currency)}. Top it up through Funds Transfer first.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/finance/petty-cash", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "spend",
          expenseDate: new Date(`${date}T12:00:00`).toISOString(),
          category,
          payee: payee.trim(),
          amountCents,
          notes: notes.trim() || null,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: { message?: string } };
      if (!res.ok || body.ok === false) {
        setError(body.error?.message ?? "Could not record the spend.");
        return;
      }
      toast("Petty cash spend recorded.");
      setSpendOpen(false);
      setPayee("");
      setAmount("");
      setNotes("");
      setRefreshKey((k) => k + 1);
    } catch {
      setError("Could not record the spend.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="view active scrollable finance-desk-view" aria-label="Petty cash">
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Business Petty Cash</h3>
            <p className="panel-subtitle muted">
              Small office cash for minor expenses. Top up from the Business Cash Book or bank through Funds
              Transfer; every spend is recorded as a firm expense.
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
            <ExportMenu kind="petty_cash_summary" formats={["pdf", "docx", "xlsx"]} />
            <Button size="sm" variant="outline" onClick={() => setRefreshKey((k) => k + 1)}>
              Refresh
            </Button>
          </div>
        </div>
        <div className="panel-body">
          <FirmMoneyCallout />
          <Can permission="finance.post">
            <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
              <Button size="sm" onClick={() => setSpendOpen((v) => !v)}>
                Record spend
              </Button>
              <Link href="/finance/transfers" className="btn btn-outline btn-sm">
                Top up or return (Funds Transfer)
              </Link>
            </div>
          </Can>

          {spendOpen ? (
            <form onSubmit={submitSpend} className="panel" style={{ padding: "1rem", marginTop: "1rem" }}>
              <h4 style={{ marginTop: 0 }}>Record petty cash spend</h4>
              <div className="grid-2">
                <div className="form-group">
                  <label htmlFor="pc-payee">Paid to</label>
                  <input id="pc-payee" value={payee} onChange={(e) => setPayee(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label htmlFor="pc-cat">Expense category</label>
                  <select id="pc-cat" value={category} onChange={(e) => setCategory(e.target.value)} required>
                    {categories.map((o) => (
                      <option key={o.code} value={o.code}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="pc-amt">Amount ({currency})</label>
                  <input
                    id="pc-amt"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="pc-date">Date</label>
                  <input
                    id="pc-date"
                    type="date"
                    max={todayInput()}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="pc-notes">Notes (receipt number, purpose)</label>
                <textarea id="pc-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              {error ? (
                <p role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem" }}>
                  {error}
                </p>
              ) : null}
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <Button type="submit" size="sm" disabled={saving}>
                  {saving ? "Saving…" : "Save spend"}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setSpendOpen(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : null}
        </div>
      </div>
      <CashAccountLedger code="1050" title="Petty Cash" refreshKey={refreshKey} onBalance={onBalance} />
    </section>
  );
}
