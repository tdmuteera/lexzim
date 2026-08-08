"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Can } from "@/components/auth/Can";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { centsToDisplay } from "@/lib/billing/money";

type Invoice = {
  id: string;
  invoiceNumber: string;
  status: string;
  currency: string;
  issueDate: string | null;
  dueDate: string | null;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  notes: string | null;
  matterId: string;
  matterTitle: string | null;
  matterNumber: string | null;
  clientDisplayName: string | null;
  paidCents: number;
  balanceCents: number;
  displayOverdue: boolean;
};

type Line = {
  id: string;
  lineType: string;
  description: string;
  quantity: number;
  unitAmountCents: number;
  amountCents: number;
};

type Payment = {
  id: string;
  amountCents: number;
  currency: string;
  paidAt: string;
  method: string | null;
  reference: string | null;
};

type InvoiceDetailViewProps = {
  invoiceId: string;
};

function todayInput() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function InvoiceDetailView({ invoiceId }: InvoiceDetailViewProps) {
  const router = useRouter();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [amountDollars, setAmountDollars] = useState("");
  const [paidAt, setPaidAt] = useState(todayInput);
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");
  const [payError, setPayError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, { credentials: "include" });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { invoice: Invoice; lines: Line[]; payments: Payment[] };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Could not load invoice.");
        setInvoice(null);
        return;
      }
      setInvoice(body.data.invoice);
      setLines(body.data.lines);
      setPayments(body.data.payments);
      if (body.data.invoice.balanceCents > 0) {
        setAmountDollars((body.data.invoice.balanceCents / 100).toFixed(2));
      }
    } catch {
      setError("Could not load invoice.");
      setInvoice(null);
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function setStatus(status: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not update status.");
        return;
      }
      await load();
    } catch {
      setError("Could not update status.");
    } finally {
      setBusy(false);
    }
  }

  async function onPay(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setPayError(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/payments`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountDollars,
          paidAt: new Date(`${paidAt}T12:00:00`).toISOString(),
          method: method || null,
          reference: reference || null,
        }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setPayError(body.error?.message ?? "Could not record payment.");
        return;
      }
      setPayOpen(false);
      await load();
    } catch {
      setPayError("Could not record payment.");
    } finally {
      setBusy(false);
    }
  }

  if (loading && !invoice) {
    return (
      <section className="view active scrollable">
        <p className="muted">Loading fee note…</p>
      </section>
    );
  }

  if (!invoice) {
    return (
      <section className="view active scrollable">
        <p role="alert" style={{ color: "var(--danger)" }}>
          {error ?? "Invoice not found."}
        </p>
        <Button size="sm" variant="outline" onClick={() => router.push("/billing")}>
          Back to billing
        </Button>
      </section>
    );
  }

  const statusLabel =
    invoice.displayOverdue && invoice.status === "sent" ? "overdue" : invoice.status;

  return (
    <section className="view active scrollable invoice-print-root" aria-label="Fee note">
      <div className="panel no-print">
        <div className="panel-head">
          <h3>{invoice.invoiceNumber}</h3>
          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
            <Button size="sm" variant="outline" onClick={() => window.print()}>
              Print
            </Button>
            <Link href="/billing" className="btn btn-outline btn-sm">
              Back
            </Link>
          </div>
        </div>
        <div className="panel-body">
          {error ? (
            <p role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem" }}>
              {error}
            </p>
          ) : null}

          <Can permission="billing.manage">
            <div className="toolbar" style={{ marginBottom: "1rem" }}>
              {invoice.status === "draft" ? (
                <Button size="sm" disabled={busy} onClick={() => void setStatus("sent")}>
                  Mark sent
                </Button>
              ) : null}
              {invoice.status === "sent" ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void setStatus("overdue")}
                >
                  Mark overdue
                </Button>
              ) : null}
              {(invoice.status === "sent" || invoice.status === "overdue") &&
              invoice.balanceCents > 0 ? (
                <Button size="sm" disabled={busy} onClick={() => setPayOpen(true)}>
                  Record fee payment
                </Button>
              ) : null}
              {invoice.status !== "void" && invoice.status !== "paid" ? (
                <Button
                  size="sm"
                  variant="danger"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Void this fee note? Source time and costs will unlock for re-invoicing.",
                      )
                    ) {
                      void setStatus("void");
                    }
                  }}
                >
                  Void
                </Button>
              ) : null}
            </div>
          </Can>

          {payOpen ? (
            <form
              onSubmit={onPay}
              className="panel"
              style={{ padding: "1rem", marginBottom: "1rem" }}
            >
              <h4 style={{ marginTop: 0 }}>Fee payment (not trust)</h4>
              {payError ? (
                <p role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem" }}>
                  {payError}
                </p>
              ) : null}
              <div className="grid-2">
                <div className="form-group">
                  <label htmlFor="pay-amt">Amount ({invoice.currency})</label>
                  <input
                    id="pay-amt"
                    type="number"
                    min={0.01}
                    step="0.01"
                    value={amountDollars}
                    onChange={(e) => setAmountDollars(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="pay-date">Paid at</label>
                  <input
                    id="pay-date"
                    type="date"
                    value={paidAt}
                    onChange={(e) => setPaidAt(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label htmlFor="pay-method">Method</label>
                  <input
                    id="pay-method"
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                    placeholder="EFT, cash…"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="pay-ref">Reference</label>
                  <input
                    id="pay-ref"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                  />
                </div>
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <Button type="submit" size="sm" disabled={busy}>
                  {busy ? "Saving…" : "Save payment"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setPayOpen(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : null}
        </div>
      </div>

      <div className="panel invoice-sheet">
        <div className="panel-body">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "1rem",
              marginBottom: "1.25rem",
            }}
          >
            <div>
              <div style={{ fontSize: "1.1rem", fontWeight: 700 }}>Fee note</div>
              <div>{invoice.invoiceNumber}</div>
              <Badge>{statusLabel}</Badge>
            </div>
            <div style={{ textAlign: "right", fontSize: "0.85rem" }}>
              <div>
                <strong>Client:</strong> {invoice.clientDisplayName ?? "n/a"}
              </div>
              <div>
                <strong>Matter:</strong>{" "}
                <Link href={`/matters/${invoice.matterId}`}>
                  {invoice.matterNumber
                    ? `${invoice.matterNumber} · ${invoice.matterTitle ?? ""}`
                    : (invoice.matterTitle ?? invoice.matterId)}
                </Link>
              </div>
              <div>
                <strong>Issued:</strong>{" "}
                {invoice.issueDate
                  ? new Date(invoice.issueDate).toLocaleDateString()
                  : "Draft"}
              </div>
              <div>
                <strong>Due:</strong>{" "}
                {invoice.dueDate
                  ? new Date(invoice.dueDate).toLocaleDateString()
                  : "n/a"}
              </div>
            </div>
          </div>

          <table className="data">
            <thead>
              <tr>
                <th>Description</th>
                <th>Type</th>
                <th>Qty</th>
                <th>Unit</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id}>
                  <td>{line.description}</td>
                  <td>{line.lineType}</td>
                  <td>{Number(line.quantity.toFixed(2))}</td>
                  <td>{centsToDisplay(line.unitAmountCents, invoice.currency)}</td>
                  <td>{centsToDisplay(line.amountCents, invoice.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: "1rem", textAlign: "right", fontSize: "0.9rem" }}>
            <div>Subtotal: {centsToDisplay(invoice.subtotalCents, invoice.currency)}</div>
            {invoice.taxCents ? (
              <div>Tax: {centsToDisplay(invoice.taxCents, invoice.currency)}</div>
            ) : null}
            <div style={{ fontWeight: 700 }}>
              Total: {centsToDisplay(invoice.totalCents, invoice.currency)}
            </div>
            <div>Paid: {centsToDisplay(invoice.paidCents, invoice.currency)}</div>
            <div>Balance: {centsToDisplay(invoice.balanceCents, invoice.currency)}</div>
          </div>

          {invoice.notes ? (
            <p style={{ marginTop: "1rem", fontSize: "0.85rem" }}>
              <strong>Notes:</strong> {invoice.notes}
            </p>
          ) : null}

          {payments.length ? (
            <div style={{ marginTop: "1.25rem" }}>
              <h4>Fee payments</h4>
              <table className="data">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Method</th>
                    <th>Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td>{new Date(p.paidAt).toLocaleDateString()}</td>
                      <td>{centsToDisplay(p.amountCents, p.currency)}</td>
                      <td>{p.method ?? "n/a"}</td>
                      <td>{p.reference ?? "n/a"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <p className="muted" style={{ marginTop: "1.5rem", fontSize: "0.75rem" }}>
            This is a fee note. Payments recorded here are fee receipts only and are not posted to
            the trust ledger.
          </p>
        </div>
      </div>
    </section>
  );
}
