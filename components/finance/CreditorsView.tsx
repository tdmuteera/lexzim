"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Can } from "@/components/auth/Can";
import { ExportMenu } from "@/components/export/ExportMenu";
import { FirmMoneyCallout } from "@/components/finance/FirmMoneyCallout";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SortableTh } from "@/components/ui/SortableTh";
import { centsToDisplay } from "@/lib/billing/money";
import { useTableSort } from "@/lib/ui/table-sort";

type CreditorRow = {
  id: string;
  name: string;
  contactEmail: string | null;
  contactPhone: string | null;
  defaultExpenseAccountId: string | null;
  isActive: boolean;
};

type InvoiceRow = {
  id: string;
  creditorId: string;
  creditorName: string;
  invoiceDate: string;
  dueDate: string | null;
  amountCents: number;
  currency: string;
  status: string;
  reference: string | null;
  expenseAccountId: string | null;
};

type AgingRow = {
  creditorName: string;
  reference: string | null;
  dueDate: string | null;
  amountCents: number;
  paidCents: number;
  balanceCents: number;
  bucket: string;
  invoiceId: string;
};

type GlOption = { code: string; label: string; glAccountId: string | null };

const BUCKET_LABELS: Record<string, string> = {
  current: "Current",
  "1-30": "1 to 30 days",
  "31-60": "31 to 60 days",
  "61-90": "61 to 90 days",
  "90+": "Over 90 days",
};

function todayInput() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function CreditorsView() {
  const [creditors, setCreditors] = useState<CreditorRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [aging, setAging] = useState<AgingRow[]>([]);
  const [glOptions, setGlOptions] = useState<GlOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"bills" | "creditors" | "ageing">("ageing");

  const [creditorOpen, setCreditorOpen] = useState(false);
  const [creditorName, setCreditorName] = useState("");
  const [creditorEmail, setCreditorEmail] = useState("");

  const [billOpen, setBillOpen] = useState(false);
  const [billCreditorId, setBillCreditorId] = useState("");
  const [billDate, setBillDate] = useState(todayInput);
  const [billDue, setBillDue] = useState("");
  const [billAmount, setBillAmount] = useState("");
  const [billRef, setBillRef] = useState("");
  const [billGlAccountId, setBillGlAccountId] = useState("");

  const [payInvoiceId, setPayInvoiceId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(todayInput);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [credRes, invRes, catRes] = await Promise.all([
        fetch("/api/finance/creditors?aging=1", { credentials: "include" }),
        fetch("/api/finance/creditors/invoices?status=open", { credentials: "include" }),
        fetch("/api/finance/expenses/categories", { credentials: "include" }),
      ]);
      const credBody = (await credRes.json()) as {
        ok: boolean;
        data?: { items: CreditorRow[]; aging?: AgingRow[] };
        error?: { message: string };
      };
      const invBody = (await invRes.json()) as {
        ok: boolean;
        data?: { items: InvoiceRow[] };
      };
      if (!credRes.ok || !credBody.ok || !credBody.data) {
        throw new Error(credBody.error?.message ?? "Could not load creditors.");
      }
      setCreditors(credBody.data.items);
      setAging(credBody.data.aging ?? []);
      if (invRes.ok && invBody.ok && invBody.data) {
        setInvoices(invBody.data.items);
      }
      if (catRes.ok) {
        const catBody = (await catRes.json()) as {
          ok?: boolean;
          data?: { items?: GlOption[] };
        };
        if (catBody.ok && catBody.data?.items) {
          setGlOptions(catBody.data.items);
          if (catBody.data.items[0]?.glAccountId) {
            setBillGlAccountId(catBody.data.items[0].glAccountId);
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load creditors.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitCreditor(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/finance/creditors", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: creditorName, contactEmail: creditorEmail || null }),
      });
      const body = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not create creditor.");
        return;
      }
      setCreditorOpen(false);
      setCreditorName("");
      setCreditorEmail("");
      await load();
    } catch {
      setError("Could not create creditor.");
    } finally {
      setSaving(false);
    }
  }

  async function submitBill(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/finance/creditors/invoices", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creditorId: billCreditorId,
          invoiceDate: new Date(`${billDate}T12:00:00`).toISOString(),
          dueDate: billDue ? new Date(`${billDue}T12:00:00`).toISOString() : null,
          amountDollars: billAmount,
          reference: billRef || null,
          expenseAccountId: billGlAccountId || null,
        }),
      });
      const body = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not record bill.");
        return;
      }
      setBillOpen(false);
      setBillAmount("");
      setBillRef("");
      await load();
    } catch {
      setError("Could not record bill.");
    } finally {
      setSaving(false);
    }
  }

  async function submitPayment(e: FormEvent) {
    e.preventDefault();
    if (!payInvoiceId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/finance/creditors/invoices/${payInvoiceId}/pay`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountDollars: payAmount,
          paidAt: new Date(`${payDate}T12:00:00`).toISOString(),
        }),
      });
      const body = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not record payment.");
        return;
      }
      setPayInvoiceId(null);
      setPayAmount("");
      await load();
    } catch {
      setError("Could not record payment.");
    } finally {
      setSaving(false);
    }
  }

  const totalOutstanding = aging.reduce((sum, r) => sum + r.balanceCents, 0);

  const agingAccessors = useMemo(
    () => ({
      creditor: (r: AgingRow) => r.creditorName,
      reference: (r: AgingRow) => r.reference ?? "",
      due: (r: AgingRow) => r.dueDate,
      age: (r: AgingRow) => BUCKET_LABELS[r.bucket] ?? r.bucket,
      balance: (r: AgingRow) => r.balanceCents,
    }),
    [],
  );
  const {
    sortedRows: sortedAging,
    sortKey: agingKey,
    sortDir: agingDir,
    toggleSort: toggleAging,
  } = useTableSort(aging, agingAccessors, { key: "due", dir: "asc" });

  const billsAccessors = useMemo(
    () => ({
      creditor: (r: InvoiceRow) => r.creditorName,
      date: (r: InvoiceRow) => r.invoiceDate,
      reference: (r: InvoiceRow) => r.reference ?? "",
      amount: (r: InvoiceRow) => r.amountCents,
    }),
    [],
  );
  const {
    sortedRows: sortedBills,
    sortKey: billsKey,
    sortDir: billsDir,
    toggleSort: toggleBills,
  } = useTableSort(invoices, billsAccessors, { key: "date", dir: "desc" });

  const creditorsAccessors = useMemo(
    () => ({
      name: (r: CreditorRow) => r.name,
      email: (r: CreditorRow) => r.contactEmail ?? "",
      status: (r: CreditorRow) => (r.isActive ? "Active" : "Inactive"),
    }),
    [],
  );
  const {
    sortedRows: sortedCreditors,
    sortKey: creditorsKey,
    sortDir: creditorsDir,
    toggleSort: toggleCreditors,
  } = useTableSort(creditors, creditorsAccessors, { key: "name", dir: "asc" });

  return (
    <section className="view active scrollable finance-desk-view" aria-label="Creditors">
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Creditors</h3>
            <p className="panel-subtitle muted">Accounts payable · who we owe</p>
          </div>
          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
            <ExportMenu kind="creditor_ageing" formats={["pdf", "docx", "xlsx"]} disabled={loading} />
            <Button size="sm" variant="outline" onClick={() => load()} disabled={loading}>
              Refresh
            </Button>
          </div>
        </div>
        <div className="panel-body">
          <FirmMoneyCallout />

          <div className="trust-overview-cards" style={{ marginBottom: "1rem" }}>
            <div className="trust-overview-card panel">
              <div className="trust-overview-card-label">Outstanding AP</div>
              <div className="trust-overview-card-balance">
                {centsToDisplay(totalOutstanding, "USD")}
              </div>
              <div className="muted" style={{ fontSize: "0.75rem" }}>
                {aging.length} open bill line(s)
              </div>
            </div>
            <div className="trust-overview-card panel">
              <div className="trust-overview-card-label">Creditors</div>
              <div className="trust-overview-card-balance">{creditors.length}</div>
            </div>
          </div>

          {error ? (
            <p role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem" }}>
              {error}
            </p>
          ) : null}

          <div className="toolbar" style={{ marginBottom: "0.75rem" }}>
            <Button size="sm" variant={tab === "ageing" ? "primary" : "outline"} onClick={() => setTab("ageing")}>
              Ageing
            </Button>
            <Button size="sm" variant={tab === "bills" ? "primary" : "outline"} onClick={() => setTab("bills")}>
              Open bills
            </Button>
            <Button size="sm" variant={tab === "creditors" ? "primary" : "outline"} onClick={() => setTab("creditors")}>
              Creditors
            </Button>
            <span className="toolbar-spacer" />
            <Can permission="finance.post">
              <Button size="sm" variant="outline" onClick={() => setCreditorOpen(true)}>
                New creditor
              </Button>
              <Button size="sm" onClick={() => setBillOpen(true)}>
                Record bill
              </Button>
            </Can>
          </div>

          {creditorOpen ? (
            <form onSubmit={submitCreditor} className="panel" style={{ padding: "1rem", marginBottom: "1rem" }}>
              <h4 style={{ marginTop: 0 }}>New creditor</h4>
              <div className="form-group">
                <label htmlFor="cr-name">Name</label>
                <input id="cr-name" value={creditorName} onChange={(e) => setCreditorName(e.target.value)} required />
              </div>
              <div className="form-group">
                <label htmlFor="cr-email">Contact email</label>
                <input id="cr-email" type="email" value={creditorEmail} onChange={(e) => setCreditorEmail(e.target.value)} />
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <Button type="submit" size="sm" disabled={saving}>Save</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setCreditorOpen(false)}>Cancel</Button>
              </div>
            </form>
          ) : null}

          {billOpen ? (
            <form onSubmit={submitBill} className="panel" style={{ padding: "1rem", marginBottom: "1rem" }}>
              <h4 style={{ marginTop: 0 }}>Record supplier bill</h4>
              <div className="form-group">
                <label htmlFor="bi-cred">Creditor</label>
                <select id="bi-cred" value={billCreditorId} onChange={(e) => setBillCreditorId(e.target.value)} required>
                  <option value="">Select creditor</option>
                  {creditors.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label htmlFor="bi-date">Bill date</label>
                  <input id="bi-date" type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label htmlFor="bi-due">Due date</label>
                  <input id="bi-due" type="date" value={billDue} onChange={(e) => setBillDue(e.target.value)} />
                </div>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label htmlFor="bi-amt">Amount</label>
                  <input id="bi-amt" type="number" min={0.01} step="0.01" value={billAmount} onChange={(e) => setBillAmount(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label htmlFor="bi-ref">Reference</label>
                  <input id="bi-ref" value={billRef} onChange={(e) => setBillRef(e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="bi-gl">Expense account (GL)</label>
                <select id="bi-gl" value={billGlAccountId} onChange={(e) => setBillGlAccountId(e.target.value)}>
                  {glOptions.map((o) =>
                    o.glAccountId ? (
                      <option key={o.code} value={o.glAccountId}>{o.label}</option>
                    ) : null,
                  )}
                </select>
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <Button type="submit" size="sm" disabled={saving}>Post bill</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setBillOpen(false)}>Cancel</Button>
              </div>
            </form>
          ) : null}

          {payInvoiceId ? (
            <form onSubmit={submitPayment} className="panel" style={{ padding: "1rem", marginBottom: "1rem" }}>
              <h4 style={{ marginTop: 0 }}>Record payment</h4>
              <div className="grid-2">
                <div className="form-group">
                  <label htmlFor="py-amt">Amount</label>
                  <input id="py-amt" type="number" min={0.01} step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label htmlFor="py-date">Paid at</label>
                  <input id="py-date" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} required />
                </div>
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <Button type="submit" size="sm" disabled={saving}>Pay</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setPayInvoiceId(null)}>Cancel</Button>
              </div>
            </form>
          ) : null}

          {tab === "ageing" ? (
            !aging.length ? (
              <EmptyState title="No outstanding bills" detail="Record a supplier bill to start AP tracking." />
            ) : (
              <div className="table-wrap">
                <table className="data data-dense">
                  <thead>
                    <tr>
                      <SortableTh
                        label="Creditor"
                        columnKey="creditor"
                        activeKey={agingKey}
                        direction={agingDir}
                        onSort={toggleAging}
                      />
                      <SortableTh
                        label="Reference"
                        columnKey="reference"
                        activeKey={agingKey}
                        direction={agingDir}
                        onSort={toggleAging}
                      />
                      <SortableTh
                        label="Due"
                        columnKey="due"
                        activeKey={agingKey}
                        direction={agingDir}
                        onSort={toggleAging}
                      />
                      <SortableTh
                        label="Age"
                        columnKey="age"
                        activeKey={agingKey}
                        direction={agingDir}
                        onSort={toggleAging}
                      />
                      <SortableTh
                        label="Balance"
                        columnKey="balance"
                        activeKey={agingKey}
                        direction={agingDir}
                        onSort={toggleAging}
                      />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedAging.map((r) => (
                      <tr key={r.invoiceId}>
                        <td>{r.creditorName}</td>
                        <td>{r.reference ?? ""}</td>
                        <td>{r.dueDate ? new Date(r.dueDate).toLocaleDateString() : ""}</td>
                        <td><Badge tone="pending">{BUCKET_LABELS[r.bucket] ?? r.bucket}</Badge></td>
                        <td>{centsToDisplay(r.balanceCents, "USD")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : null}

          {tab === "bills" ? (
            !invoices.length ? (
              <EmptyState title="No open bills" detail="All supplier bills are paid or none recorded yet." />
            ) : (
              <div className="table-wrap">
                <table className="data data-dense">
                  <thead>
                    <tr>
                      <SortableTh
                        label="Creditor"
                        columnKey="creditor"
                        activeKey={billsKey}
                        direction={billsDir}
                        onSort={toggleBills}
                      />
                      <SortableTh
                        label="Date"
                        columnKey="date"
                        activeKey={billsKey}
                        direction={billsDir}
                        onSort={toggleBills}
                      />
                      <SortableTh
                        label="Reference"
                        columnKey="reference"
                        activeKey={billsKey}
                        direction={billsDir}
                        onSort={toggleBills}
                      />
                      <SortableTh
                        label="Amount"
                        columnKey="amount"
                        activeKey={billsKey}
                        direction={billsDir}
                        onSort={toggleBills}
                      />
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedBills.map((inv) => (
                      <tr key={inv.id}>
                        <td>{inv.creditorName}</td>
                        <td>{new Date(inv.invoiceDate).toLocaleDateString()}</td>
                        <td>{inv.reference ?? ""}</td>
                        <td>{centsToDisplay(inv.amountCents, inv.currency)}</td>
                        <td>
                          <Can permission="finance.post">
                            <Button size="sm" variant="outline" onClick={() => setPayInvoiceId(inv.id)}>
                              Pay
                            </Button>
                          </Can>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : null}

          {tab === "creditors" ? (
            !creditors.length ? (
              <EmptyState title="No creditors" detail="Add suppliers you pay on account." />
            ) : (
              <div className="table-wrap">
                <table className="data data-dense">
                  <thead>
                    <tr>
                      <SortableTh
                        label="Name"
                        columnKey="name"
                        activeKey={creditorsKey}
                        direction={creditorsDir}
                        onSort={toggleCreditors}
                      />
                      <SortableTh
                        label="Email"
                        columnKey="email"
                        activeKey={creditorsKey}
                        direction={creditorsDir}
                        onSort={toggleCreditors}
                      />
                      <SortableTh
                        label="Status"
                        columnKey="status"
                        activeKey={creditorsKey}
                        direction={creditorsDir}
                        onSort={toggleCreditors}
                      />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedCreditors.map((c) => (
                      <tr key={c.id}>
                        <td>{c.name}</td>
                        <td>{c.contactEmail ?? ""}</td>
                        <td>
                          <Badge tone={c.isActive ? "open" : "closed"}>
                            {c.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : null}
        </div>
      </div>
    </section>
  );
}
