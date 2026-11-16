"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { centsToDisplay } from "@/lib/billing/money";
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS } from "@/lib/finance/expense-categories";

type Template = {
  id: string;
  name: string;
  kind: string;
  mode: string;
  intervalUnit: string;
  intervalCount: number;
  nextRunOn: string;
  endOn: string | null;
  isActive: boolean;
  currency: string;
  amountCents: number | null;
  payloadJson: Record<string, unknown>;
  lastRunOn: string | null;
  lastRunStatus: string | null;
  lastRunError: string | null;
};

type Creditor = { id: string; name: string };

type ApiBody = {
  ok?: boolean;
  data?: Record<string, unknown>;
  error?: { message?: string };
};

async function readJson(res: Response) {
  return (await res.json().catch(() => ({}))) as ApiBody;
}

function errMsg(body: ApiBody, fallback: string) {
  return body.error?.message ?? fallback;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function RecurringFinanceView() {
  const [items, setItems] = useState<Template[]>([]);
  const [creditors, setCreditors] = useState<Creditor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState("");
  const [kind, setKind] = useState<"expense" | "creditor_bill" | "fee_invoice">("expense");
  const [mode, setMode] = useState<"scheduled" | "reminder" | "unscheduled">("scheduled");
  const [intervalUnit, setIntervalUnit] = useState<"weekly" | "monthly" | "yearly">("monthly");
  const [nextRunOn, setNextRunOn] = useState(todayIso());
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("rent");
  const [payee, setPayee] = useState("");
  const [creditorId, setCreditorId] = useState("");
  const [clientId, setClientId] = useState("");
  const [matterId, setMatterId] = useState("");
  const [lineDescription, setLineDescription] = useState("Professional fees");
  const [lineAmount, setLineAmount] = useState("");

  const dueCount = useMemo(
    () => items.filter((t) => t.isActive && t.mode !== "unscheduled" && t.nextRunOn <= todayIso()).length,
    [items],
  );

  const load = useCallback(async () => {
    const res = await fetch("/api/finance/recurring");
    const body = await readJson(res);
    if (!res.ok || !body.ok || !body.data) {
      setError(errMsg(body, "Could not load recurring templates."));
      return;
    }
    setItems((body.data.items as Template[]) ?? []);
  }, []);

  const loadCreditors = useCallback(async () => {
    const res = await fetch("/api/finance/creditors");
    const body = await readJson(res);
    if (!res.ok || !body.ok || !body.data) return;
    const list = (body.data.items as Creditor[]) ?? (body.data.creditors as Creditor[]) ?? [];
    setCreditors(list);
    if (!creditorId && list[0]) setCreditorId(list[0].id);
  }, [creditorId]);

  useEffect(() => {
    void load();
    void loadCreditors();
  }, [load, loadCreditors]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        name,
        kind,
        mode,
        intervalUnit,
        intervalCount: 1,
        nextRunOn,
        currency: "USD",
      };
      if (kind === "expense") {
        payload.amount = amount;
        payload.payload = { category, payee, paymentSource: "cash", notes: null };
      } else if (kind === "creditor_bill") {
        payload.amount = amount;
        payload.payload = {
          creditorId,
          reference: name,
          notes: null,
          dueDays: 14,
          expenseAccountId: null,
        };
      } else {
        payload.payload = {
          clientId,
          matterId,
          notes: null,
          subject: name,
          lines: [
            {
              description: lineDescription,
              qty: 1,
              unitPriceDollars: lineAmount,
            },
          ],
        };
      }

      const res = await fetch("/api/finance/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await readJson(res);
      if (!res.ok || !body.ok) {
        setError(errMsg(body, "Could not create template."));
        return;
      }
      setShowForm(false);
      setName("");
      setAmount("");
      setPayee("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function runOne(id: string, forceCreate = false) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/finance/recurring/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run", forceCreate }),
      });
      const body = await readJson(res);
      if (!res.ok || !body.ok) {
        setError(errMsg(body, "Run failed."));
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function runDue() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/finance/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run_due" }),
      });
      const body = await readJson(res);
      if (!res.ok || !body.ok) {
        setError(errMsg(body, "Run due failed."));
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await fetch(`/api/finance/recurring/${id}`, { method: "DELETE" });
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack gap-lg">
      <div className="row gap-sm wrap">
        <Button type="button" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Close form" : "New template"}
        </Button>
        <Button type="button" variant="outline" disabled={busy || dueCount === 0} onClick={() => void runDue()}>
          Run due ({dueCount})
        </Button>
        <Link href="/finance/expenses" className="muted">
          Expenses →
        </Link>
        <Link href="/finance/creditors" className="muted">
          Creditors →
        </Link>
        <Link href="/finance/invoicing" className="muted">
          Invoicing →
        </Link>
      </div>

      <p className="muted">
        QuickBooks-style recurring templates. <strong>Scheduled</strong> creates the document when due.
        <strong> Reminder</strong> only advances the date until you click Run (create).{" "}
        <strong>Unscheduled</strong> is a reusable template you run manually.
      </p>

      {error ? <p className="form-error">{error}</p> : null}

      {showForm ? (
        <form className="panel stack gap-sm" onSubmit={onCreate}>
          <h2 className="h3">New recurring template</h2>
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            Kind
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
            >
              <option value="expense">Firm expense</option>
              <option value="creditor_bill">Creditor bill</option>
              <option value="fee_invoice">Fee invoice (draft)</option>
            </select>
          </label>
          <label>
            Mode
            <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
              <option value="scheduled">Scheduled (auto-create when due)</option>
              <option value="reminder">Reminder (review before create)</option>
              <option value="unscheduled">Unscheduled (manual only)</option>
            </select>
          </label>
          <label>
            Interval
            <select
              value={intervalUnit}
              onChange={(e) => setIntervalUnit(e.target.value as typeof intervalUnit)}
            >
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </label>
          <label>
            Next run
            <input type="date" value={nextRunOn} onChange={(e) => setNextRunOn(e.target.value)} required />
          </label>

          {kind === "expense" ? (
            <>
              <label>
                Category
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {EXPENSE_CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Payee
                <input value={payee} onChange={(e) => setPayee(e.target.value)} required />
              </label>
              <label>
                Amount (USD)
                <input value={amount} onChange={(e) => setAmount(e.target.value)} required />
              </label>
            </>
          ) : null}

          {kind === "creditor_bill" ? (
            <>
              <label>
                Creditor
                <select value={creditorId} onChange={(e) => setCreditorId(e.target.value)} required>
                  {creditors.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Amount (USD)
                <input value={amount} onChange={(e) => setAmount(e.target.value)} required />
              </label>
            </>
          ) : null}

          {kind === "fee_invoice" ? (
            <>
              <label>
                Client id
                <input value={clientId} onChange={(e) => setClientId(e.target.value)} required />
              </label>
              <label>
                Matter id
                <input value={matterId} onChange={(e) => setMatterId(e.target.value)} required />
              </label>
              <label>
                Line description
                <input
                  value={lineDescription}
                  onChange={(e) => setLineDescription(e.target.value)}
                  required
                />
              </label>
              <label>
                Line amount (USD)
                <input value={lineAmount} onChange={(e) => setLineAmount(e.target.value)} required />
              </label>
              <p className="muted">
                Paste client/matter UUIDs from the client or matter screen for now. Draft invoices are
                created for review before send.
              </p>
            </>
          ) : null}

          <Button type="submit" disabled={busy}>
            Save template
          </Button>
        </form>
      ) : null}

      {items.length === 0 ? (
        <EmptyState
          title="No recurring templates"
          detail="Create rent, software, creditor bills, or standing fee invoices."
        />
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Kind</th>
              <th>Mode</th>
              <th>Next</th>
              <th>Amount</th>
              <th>Last</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((t) => {
              const due = t.isActive && t.mode !== "unscheduled" && t.nextRunOn <= todayIso();
              return (
                <tr key={t.id}>
                  <td>
                    {t.name}{" "}
                    {!t.isActive ? <Badge tone="closed">Off</Badge> : null}
                    {due ? <Badge tone="pending">Due</Badge> : null}
                  </td>
                  <td>{t.kind}</td>
                  <td>
                    {t.mode} · every {t.intervalCount} {t.intervalUnit}
                  </td>
                  <td>{t.nextRunOn}</td>
                  <td>
                    {t.amountCents != null
                      ? centsToDisplay(t.amountCents, t.currency)
                      : "lines"}
                  </td>
                  <td className="muted">
                    {t.lastRunStatus ?? "—"}
                    {t.lastRunOn ? ` · ${t.lastRunOn}` : ""}
                    {t.lastRunError ? ` · ${t.lastRunError}` : ""}
                  </td>
                  <td>
                    <div className="row gap-xs wrap">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void runOne(t.id, t.mode === "reminder")}
                      >
                        {t.mode === "reminder" ? "Create now" : "Run"}
                      </Button>
                      {t.mode === "reminder" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => void runOne(t.id, false)}
                        >
                          Snooze
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void remove(t.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
