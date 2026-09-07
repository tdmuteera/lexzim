"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { Can } from "@/components/auth/Can";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { centsToDisplay } from "@/lib/billing/money";
import {
  FEE_CATEGORIES,
  FEE_CATEGORY_LABELS,
  type AllocationLineType,
  type FeeCategory,
  type PaymentDestination,
} from "@/lib/finance/payment-intake-validation";

type FeeCategoryOption = { id: FeeCategory; label: string };

type IntakeItem = {
  id: string;
  receiptNumber: string | null;
  receivedAt: string;
  amountCents: number;
  currency: string;
  destination: string;
  method: string | null;
  reference: string | null;
  clientId: string;
  clientName: string;
  clientNumber: string | null;
  matterId: string | null;
  matterTitle: string | null;
  matterNumber: string | null;
  lineCount: number;
  notes: string | null;
};

type ClientOption = { id: string; label: string };
type MatterOption = {
  id: string;
  title: string;
  matterNumber: string | null;
  clientId: string;
};
type TrustAccountOption = {
  id: string;
  name: string;
  accountKind: string;
  currency: string;
};
type InvoiceOption = {
  id: string;
  invoiceNumber: string;
  status: string;
  totalCents: number;
  currency: string;
  clientId: string | null;
};

type DraftLine = {
  key: string;
  lineType: AllocationLineType;
  feeCategory: FeeCategory;
  amountDollars: string;
  invoiceId: string;
  notes: string;
};

function todayInput() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function destinationLabel(destination: string): string {
  if (destination === "trust_bank") return "Trust bank";
  if (destination === "trust_vault") return "Trust vault";
  if (destination === "fee_bank") return "Fee bank";
  return destination;
}

function newLine(lineType: AllocationLineType = "trust_hold"): DraftLine {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    lineType,
    feeCategory: "consultation",
    amountDollars: "",
    invoiceId: "",
    notes: "",
  };
}

function dollarsToCentsLocal(value: string): number {
  const n = Number(value.trim().replace(/,/g, ""));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function PaymentsView() {
  const { user, can } = useAuth();
  const currency = user?.firm?.defaultCurrency || "USD";

  const [items, setItems] = useState<IntakeItem[]>([]);
  const [feeCategories, setFeeCategories] = useState<FeeCategoryOption[]>(
    FEE_CATEGORIES.map((id) => ({ id, label: FEE_CATEGORY_LABELS[id] })),
  );
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [matters, setMatters] = useState<MatterOption[]>([]);
  const [accounts, setAccounts] = useState<TrustAccountOption[]>([]);
  const [invoices, setInvoices] = useState<InvoiceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [filterClientId, setFilterClientId] = useState("");
  const [filterDestination, setFilterDestination] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [matterId, setMatterId] = useState("");
  const [receivedAt, setReceivedAt] = useState(todayInput);
  const [amountDollars, setAmountDollars] = useState("500");
  const [destination, setDestination] = useState<PaymentDestination>("trust_bank");
  const [trustAccountId, setTrustAccountId] = useState("");
  const [method, setMethod] = useState("Bank");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([
    { ...newLine("trust_hold"), amountDollars: "250" },
    { ...newLine("fee_revenue"), amountDollars: "250", feeCategory: "consultation" },
  ]);

  const amountCents = dollarsToCentsLocal(amountDollars);
  const lineSumCents = useMemo(
    () => lines.reduce((sum, line) => sum + dollarsToCentsLocal(line.amountDollars), 0),
    [lines],
  );
  const splitOk = amountCents > 0 && lineSumCents === amountCents;

  const clientMatters = useMemo(
    () => matters.filter((m) => !clientId || m.clientId === clientId),
    [matters, clientId],
  );

  const trustAccountsForDestination = useMemo(() => {
    const kind = destination === "trust_vault" ? "vault" : "bank";
    return accounts.filter((a) => a.accountKind === kind);
  }, [accounts, destination]);

  const clientInvoices = useMemo(
    () =>
      invoices.filter(
        (inv) =>
          (!clientId || inv.clientId === clientId) &&
          inv.status !== "draft" &&
          inv.status !== "void",
      ),
    [invoices, clientId],
  );

  const loadRegister = useCallback(async () => {
    setError(null);
    const params = new URLSearchParams();
    if (filterClientId) params.set("clientId", filterClientId);
    if (filterDestination) params.set("destination", filterDestination);
    if (filterFrom) params.set("from", new Date(filterFrom).toISOString());
    if (filterTo) {
      const end = new Date(filterTo);
      end.setHours(23, 59, 59, 999);
      params.set("to", end.toISOString());
    }
    const res = await fetch(`/api/finance/payments?${params}`, {
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error?.message || "Could not load payments.");
    }
    const payload = data.data ?? data;
    setItems(payload.items ?? []);
    if (Array.isArray(payload.feeCategories)) setFeeCategories(payload.feeCategories);
  }, [filterClientId, filterDestination, filterFrom, filterTo]);

  const loadLookups = useCallback(async () => {
    const [clientsRes, mattersRes, accountsRes, invoicesRes] = await Promise.all([
      fetch("/api/clients?archived=active", { credentials: "include" }),
      fetch("/api/matters?bucket=all", { credentials: "include" }),
      fetch("/api/trust/accounts?active=all", { credentials: "include" }),
      can("billing.view")
        ? fetch("/api/invoices", { credentials: "include" })
        : Promise.resolve(null),
    ]);

    if (clientsRes.ok) {
      const data = await clientsRes.json();
      const payload = data.data ?? data;
      const list = (payload.items ?? payload.clients ?? []) as Array<{
        id: string;
        displayName?: string;
        fullName?: string;
        legalName?: string;
        clientNumber?: string | null;
      }>;
      setClients(
        list.map((c) => ({
          id: c.id,
          label:
            c.displayName ||
            c.fullName ||
            c.legalName ||
            c.clientNumber ||
            c.id.slice(0, 8),
        })),
      );
    }

    if (mattersRes.ok) {
      const data = await mattersRes.json();
      const payload = data.data ?? data;
      const list = (payload.items ?? payload.matters ?? []) as Array<{
        id: string;
        title: string;
        matterNumber?: string | null;
        clientId: string;
      }>;
      setMatters(
        list.map((m) => ({
          id: m.id,
          title: m.title,
          matterNumber: m.matterNumber ?? null,
          clientId: m.clientId,
        })),
      );
    }

    if (accountsRes.ok) {
      const data = await accountsRes.json();
      const payload = data.data ?? data;
      const list = (payload.items ?? payload.accounts ?? []) as Array<{
        id: string;
        name: string;
        accountKind: string;
        currency: string;
        isActive?: boolean;
      }>;
      setAccounts(
        list
          .filter((a) => a.isActive !== false)
          .map((a) => ({
            id: a.id,
            name: a.name,
            accountKind: a.accountKind,
            currency: a.currency,
          })),
      );
    }

    if (invoicesRes?.ok) {
      const data = await invoicesRes.json();
      const payload = data.data ?? data;
      const list = (payload.items ?? payload.invoices ?? []) as Array<{
        id: string;
        invoiceNumber: string;
        status: string;
        totalCents: number;
        currency: string;
        clientId?: string | null;
      }>;
      setInvoices(
        list.map((inv) => ({
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          status: inv.status,
          totalCents: inv.totalCents,
          currency: inv.currency,
          clientId: inv.clientId ?? null,
        })),
      );
    }
  }, [can]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await Promise.all([loadRegister(), loadLookups()]);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load Payments.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadRegister, loadLookups]);

  useEffect(() => {
    if (destination === "fee_bank") {
      setTrustAccountId("");
      setLines((prev) =>
        prev.map((line) =>
          line.lineType === "fee_revenue" ? line : { ...line, lineType: "fee_revenue" },
        ),
      );
      return;
    }
    const match = trustAccountsForDestination[0];
    if (match && !trustAccountsForDestination.some((a) => a.id === trustAccountId)) {
      setTrustAccountId(match.id);
    }
  }, [destination, trustAccountsForDestination, trustAccountId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!splitOk) {
      setError("Allocation lines must equal cash received.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/finance/payments", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          matterId: matterId || null,
          receivedAt: new Date(receivedAt).toISOString(),
          amountDollars,
          currency,
          destination,
          trustAccountId: destination === "fee_bank" ? null : trustAccountId,
          method: method || null,
          reference: reference || null,
          notes: notes || null,
          lines: lines.map((line) => ({
            lineType: line.lineType,
            feeCategory: line.lineType === "fee_revenue" ? line.feeCategory : null,
            amountDollars: line.amountDollars,
            invoiceId: line.invoiceId || null,
            notes: line.notes || null,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error?.message || "Could not record payment.");
      }
      const payload = data.data ?? data;
      const intakeId = payload.intake?.id as string | undefined;
      setFormOpen(false);
      await loadRegister();
      if (intakeId) {
        window.open(
          `/api/export/payment_intake?id=${encodeURIComponent(intakeId)}&format=pdf`,
          "_blank",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record payment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="view active scrollable" aria-label="Payments">
      <div className="panel">
        <div className="panel-head" style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <h3 style={{ marginRight: "auto" }}>Payments</h3>
          <Link href="/finance/trust" className="btn btn-ghost btn-sm">
            Trust
          </Link>
          <Link href="/finance/client-accounts" className="btn btn-ghost btn-sm">
            Client accounts
          </Link>
          <Link href="/finance/invoicing" className="btn btn-ghost btn-sm">
            Invoicing
          </Link>
          <Can permission="finance.payments.create">
            <Button type="button" onClick={() => setFormOpen((v) => !v)}>
              {formOpen ? "Close form" : "New payment"}
            </Button>
          </Can>
        </div>
        <div className="panel-body">
          <p style={{ marginTop: 0 }}>
            Record money received and split it across trust hold, fee revenue, and
            disbursement float. Trust first by default. Fees-only receipts use the fee bank.
            One cash receipt number per bank or vault event. Trust portions post to the trust
            ledger; fee portions post as fee receipts or retainer apply. The same cash is not
            double-counted.
          </p>

          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}

          {formOpen ? (
            <form
              onSubmit={onSubmit}
              className="stack"
              style={{
                marginBottom: "1.25rem",
                padding: "1rem",
                border: "1px solid var(--border)",
                borderRadius: "8px",
              }}
            >
              <div className="form-grid" style={{ display: "grid", gap: "0.75rem" }}>
                <label>
                  Client
                  <select
                    required
                    value={clientId}
                    onChange={(e) => {
                      setClientId(e.target.value);
                      setMatterId("");
                    }}
                  >
                    <option value="">Select client</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Matter (optional)
                  <select value={matterId} onChange={(e) => setMatterId(e.target.value)}>
                    <option value="">No matter</option>
                    {clientMatters.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.matterNumber ? `${m.matterNumber} · ` : ""}
                        {m.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Received date
                  <input
                    type="date"
                    required
                    value={receivedAt}
                    onChange={(e) => setReceivedAt(e.target.value)}
                  />
                </label>
                <label>
                  Cash received ({currency})
                  <input
                    required
                    inputMode="decimal"
                    value={amountDollars}
                    onChange={(e) => setAmountDollars(e.target.value)}
                  />
                </label>
                <label>
                  Destination
                  <select
                    value={destination}
                    onChange={(e) => setDestination(e.target.value as PaymentDestination)}
                  >
                    <option value="trust_bank">Trust bank (default)</option>
                    <option value="trust_vault">Trust vault</option>
                    <option value="fee_bank">Fee bank (fees only)</option>
                  </select>
                </label>
                {destination !== "fee_bank" ? (
                  <label>
                    Trust account
                    <select
                      required
                      value={trustAccountId}
                      onChange={(e) => setTrustAccountId(e.target.value)}
                    >
                      <option value="">Select account</option>
                      {trustAccountsForDestination.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label>
                  Method
                  <input value={method} onChange={(e) => setMethod(e.target.value)} />
                </label>
                <label>
                  Bank / payer reference
                  <input value={reference} onChange={(e) => setReference(e.target.value)} />
                </label>
                <label>
                  Notes
                  <input value={notes} onChange={(e) => setNotes(e.target.value)} />
                </label>
              </div>

              <div style={{ marginTop: "1rem" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    flexWrap: "wrap",
                    marginBottom: "0.5rem",
                  }}
                >
                  <strong>Allocation split</strong>
                  <Badge tone={splitOk ? "open" : "pending"}>
                    Lines {centsToDisplay(lineSumCents, currency)} / cash{" "}
                    {centsToDisplay(amountCents, currency)}
                  </Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() =>
                      setLines((prev) => [
                        ...prev,
                        newLine(destination === "fee_bank" ? "fee_revenue" : "trust_hold"),
                      ])
                    }
                  >
                    Add line
                  </Button>
                </div>

                <div style={{ display: "grid", gap: "0.75rem" }}>
                  {lines.map((line, index) => (
                    <div
                      key={line.key}
                      style={{
                        display: "grid",
                        gap: "0.5rem",
                        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                        alignItems: "end",
                        padding: "0.75rem",
                        background: "var(--surface-2, transparent)",
                        borderRadius: "6px",
                      }}
                    >
                      <label>
                        Type
                        <select
                          value={line.lineType}
                          disabled={destination === "fee_bank"}
                          onChange={(e) => {
                            const lineType = e.target.value as AllocationLineType;
                            setLines((prev) =>
                              prev.map((row, i) =>
                                i === index ? { ...row, lineType } : row,
                              ),
                            );
                          }}
                        >
                          <option value="trust_hold">Trust hold</option>
                          <option value="disbursement_float">Disbursement float</option>
                          <option value="fee_revenue">Fee revenue</option>
                        </select>
                      </label>
                      {line.lineType === "fee_revenue" ? (
                        <label>
                          Fee category
                          <select
                            value={line.feeCategory}
                            onChange={(e) => {
                              const feeCategory = e.target.value as FeeCategory;
                              setLines((prev) =>
                                prev.map((row, i) =>
                                  i === index ? { ...row, feeCategory } : row,
                                ),
                              );
                            }}
                          >
                            {feeCategories.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      <label>
                        Amount
                        <input
                          required
                          inputMode="decimal"
                          value={line.amountDollars}
                          onChange={(e) => {
                            const amountDollarsValue = e.target.value;
                            setLines((prev) =>
                              prev.map((row, i) =>
                                i === index
                                  ? { ...row, amountDollars: amountDollarsValue }
                                  : row,
                              ),
                            );
                          }}
                        />
                      </label>
                      {line.lineType === "fee_revenue" ? (
                        <label>
                          Invoice (optional)
                          <select
                            value={line.invoiceId}
                            onChange={(e) => {
                              const invoiceId = e.target.value;
                              setLines((prev) =>
                                prev.map((row, i) =>
                                  i === index ? { ...row, invoiceId } : row,
                                ),
                              );
                            }}
                          >
                            <option value="">No invoice (direct fee)</option>
                            {clientInvoices.map((inv) => (
                              <option key={inv.id} value={inv.id}>
                                {inv.invoiceNumber} ·{" "}
                                {centsToDisplay(inv.totalCents, inv.currency)}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <label>
                          Line note
                          <input
                            value={line.notes}
                            onChange={(e) => {
                              const notesValue = e.target.value;
                              setLines((prev) =>
                                prev.map((row, i) =>
                                  i === index ? { ...row, notes: notesValue } : row,
                                ),
                              );
                            }}
                          />
                        </label>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={lines.length <= 1}
                        onClick={() =>
                          setLines((prev) => prev.filter((_, i) => i !== index))
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
                <Button type="submit" disabled={saving || !splitOk || !clientId}>
                  {saving ? "Saving…" : "Record payment"}
                </Button>
              </div>
            </form>
          ) : null}

          <div
            className="filters"
            style={{
              display: "grid",
              gap: "0.5rem",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              marginBottom: "1rem",
            }}
          >
            <label>
              Filter client
              <select
                value={filterClientId}
                onChange={(e) => setFilterClientId(e.target.value)}
              >
                <option value="">All</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Destination
              <select
                value={filterDestination}
                onChange={(e) => setFilterDestination(e.target.value)}
              >
                <option value="">All</option>
                <option value="trust_bank">Trust bank</option>
                <option value="trust_vault">Trust vault</option>
                <option value="fee_bank">Fee bank</option>
              </select>
            </label>
            <label>
              From
              <input
                type="date"
                value={filterFrom}
                onChange={(e) => setFilterFrom(e.target.value)}
              />
            </label>
            <label>
              To
              <input
                type="date"
                value={filterTo}
                onChange={(e) => setFilterTo(e.target.value)}
              />
            </label>
          </div>

          {loading ? (
            <p className="muted">Loading payments…</p>
          ) : items.length === 0 ? (
            <EmptyState
              title="No payment intakes yet"
              detail="Record a cash receipt and split it across trust hold, fees, and disbursement float."
            />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Receipt</th>
                    <th>Date</th>
                    <th>Client</th>
                    <th>Destination</th>
                    <th>Amount</th>
                    <th>Lines</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.receiptNumber ?? "—"}</td>
                      <td>
                        {new Date(item.receivedAt).toLocaleDateString(undefined, {
                          dateStyle: "medium",
                        })}
                      </td>
                      <td>
                        {item.clientName}
                        {item.matterNumber ? (
                          <div className="muted">{item.matterNumber}</div>
                        ) : null}
                      </td>
                      <td>{destinationLabel(item.destination)}</td>
                      <td>{centsToDisplay(item.amountCents, item.currency)}</td>
                      <td>{item.lineCount}</td>
                      <td>
                        <a
                          href={`/api/export/payment_intake?id=${encodeURIComponent(item.id)}&format=pdf`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Receipt
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
