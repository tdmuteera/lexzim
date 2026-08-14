"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Can } from "@/components/auth/Can";
import { AccountingSubNav } from "@/components/finance/AccountingSubNav";
import { FirmMoneyCallout } from "@/components/finance/FirmMoneyCallout";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { centsToDisplay } from "@/lib/billing/money";

type GlAccount = { id: string; code: string; name: string; isActive: boolean };
type JournalItem = {
  id: string;
  entryDate: string;
  reference: string | null;
  memo: string | null;
  sourceType: string;
  postedByName: string | null;
  postedAt: string;
  lineCount: number;
  totalDebitCents: number;
};

type DraftLine = {
  accountId: string;
  debit: string;
  credit: string;
  lineMemo: string;
};

function todayInput() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseMoneyToCents(value: string): number {
  const n = Number(value.replace(/,/g, "").trim());
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function GlJournalsView() {
  const { user } = useAuth();
  const currency = user?.firm?.defaultCurrency || "USD";

  const [items, setItems] = useState<JournalItem[]>([]);
  const [accounts, setAccounts] = useState<GlAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const [entryDate, setEntryDate] = useState(todayInput);
  const [reference, setReference] = useState("");
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([
    { accountId: "", debit: "", credit: "", lineMemo: "" },
    { accountId: "", debit: "", credit: "", lineMemo: "" },
  ]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [jRes, aRes] = await Promise.all([
        fetch("/api/finance/gl/journals", { credentials: "include" }),
        fetch("/api/finance/gl/accounts", { credentials: "include" }),
      ]);
      const jBody = (await jRes.json()) as {
        ok?: boolean;
        data?: { items?: JournalItem[] };
        error?: { message: string };
      };
      const aBody = (await aRes.json()) as {
        ok?: boolean;
        data?: { items?: GlAccount[] };
      };
      if (!jRes.ok || !jBody.ok) {
        setError(jBody.error?.message ?? "Could not load journal entries.");
        setItems([]);
      } else {
        setItems(jBody.data?.items ?? []);
      }
      if (aRes.ok && aBody.ok) {
        setAccounts((aBody.data?.items ?? []).filter((a) => a.isActive));
      }
    } catch {
      setError("Could not load journal entries.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const draftTotals = useMemo(() => {
    let debit = 0;
    let credit = 0;
    for (const line of lines) {
      debit += parseMoneyToCents(line.debit);
      credit += parseMoneyToCents(line.credit);
    }
    return { debit, credit, balanced: debit > 0 && debit === credit };
  }, [lines]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/finance/gl/journals", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryDate: new Date(`${entryDate}T12:00:00`).toISOString(),
          reference: reference.trim() || null,
          memo: memo.trim() || null,
          lines: lines.map((l) => ({
            accountId: l.accountId,
            debitCents: parseMoneyToCents(l.debit),
            creditCents: parseMoneyToCents(l.credit),
            currency,
            lineMemo: l.lineMemo.trim() || null,
          })),
        }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not post journal entry.");
        return;
      }
      setFormOpen(false);
      setReference("");
      setMemo("");
      setLines([
        { accountId: "", debit: "", credit: "", lineMemo: "" },
        { accountId: "", debit: "", credit: "", lineMemo: "" },
      ]);
      await load();
    } catch {
      setError("Could not post journal entry.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="view active scrollable finance-desk-view" aria-label="Journal entries">
      <AccountingSubNav />
      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Journal entries</h2>
            <p className="muted">Manual double-entry postings. Debits must equal credits.</p>
          </div>
          <Can permission="finance.gl.post">
            <Button type="button" size="sm" onClick={() => setFormOpen((v) => !v)}>
              {formOpen ? "Cancel" : "New journal entry"}
            </Button>
          </Can>
        </div>

        <FirmMoneyCallout />

        {formOpen ? (
          <form className="form-panel gl-journal-form" onSubmit={onSubmit}>
            <div className="form-row">
              <label>
                Entry date
                <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} required />
              </label>
              <label>
                Reference
                <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" />
              </label>
            </div>
            <label>
              Memo
              <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Optional narrative" />
            </label>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Debit</th>
                    <th>Credit</th>
                    <th>Line memo</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => (
                    <tr key={idx}>
                      <td>
                        <select
                          value={line.accountId}
                          onChange={(e) => {
                            const next = [...lines];
                            next[idx] = { ...line, accountId: e.target.value };
                            setLines(next);
                          }}
                          required
                        >
                          <option value="">Select account</option>
                          {accounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.code} · {a.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.debit}
                          onChange={(e) => {
                            const next = [...lines];
                            next[idx] = { ...line, debit: e.target.value, credit: "" };
                            setLines(next);
                          }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.credit}
                          onChange={(e) => {
                            const next = [...lines];
                            next[idx] = { ...line, credit: e.target.value, debit: "" };
                            setLines(next);
                          }}
                        />
                      </td>
                      <td>
                        <input
                          value={line.lineMemo}
                          onChange={(e) => {
                            const next = [...lines];
                            next[idx] = { ...line, lineMemo: e.target.value };
                            setLines(next);
                          }}
                        />
                      </td>
                      <td>
                        {lines.length > 2 ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setLines(lines.filter((_, i) => i !== idx))}
                          >
                            Remove
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="form-actions">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setLines([...lines, { accountId: "", debit: "", credit: "", lineMemo: "" }])
                }
              >
                Add line
              </Button>
              <span className={`muted${draftTotals.balanced ? " text-success" : ""}`}>
                Debits {centsToDisplay(draftTotals.debit, currency)} · Credits{" "}
                {centsToDisplay(draftTotals.credit, currency)}
                {draftTotals.balanced ? " · Balanced" : ""}
              </span>
              <Button type="submit" size="sm" disabled={saving || !draftTotals.balanced}>
                {saving ? "Posting…" : "Post entry"}
              </Button>
            </div>
          </form>
        ) : null}

        {loading ? <p className="muted">Loading entries…</p> : null}
        {error ? <p className="error-text">{error}</p> : null}

        {!loading && !error && items.length === 0 ? (
          <EmptyState title="No journal entries yet" detail="Post a manual entry to start the general ledger." />
        ) : null}

        {!loading && items.length > 0 ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Reference</th>
                  <th>Memo</th>
                  <th>Source</th>
                  <th>Posted by</th>
                  <th className="align-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((j) => (
                  <tr key={j.id}>
                    <td>{formatShortDate(j.entryDate)}</td>
                    <td>{j.reference ?? "—"}</td>
                    <td>{j.memo ?? "—"}</td>
                    <td>{j.sourceType}</td>
                    <td>{j.postedByName ?? "—"}</td>
                    <td className="align-right">
                      {centsToDisplay(j.totalDebitCents, currency)} ({j.lineCount} lines)
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  );
}
