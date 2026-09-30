"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { Can } from "@/components/auth/Can";
import { ReasonActionButton } from "@/components/finance/ReasonActionButton";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SortableTh } from "@/components/ui/SortableTh";
import { centsToDisplay } from "@/lib/billing/money";
import {
  FEE_CATEGORIES,
  FEE_CATEGORY_LABELS,
  type AllocationLineType,
  type FeeCategory,
  type PaymentDestination,
} from "@/lib/finance/payment-intake-validation";
import { useTableSort } from "@/lib/ui/table-sort";

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
  reversedAt?: string | null;
  reversalReason?: string | null;
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
  feeMode: "" | "invoice" | "direct";
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
  if (destination === "fee_vault") return "Business Cash Book";
  return destination;
}

function isFeesOnlyUi(destination: string): boolean {
  return destination === "fee_bank" || destination === "fee_vault";
}

function newLine(lineType: AllocationLineType = "trust_hold"): DraftLine {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    lineType,
    feeCategory: "consultation",
    amountDollars: "",
    invoiceId: "",
    notes: "",
    feeMode: "",
  };
}

function dollarsToCentsLocal(value: string): number {
  const n = Number(value.trim().replace(/,/g, ""));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function PaymentMoneyCallout() {
  return (
    <div className="finance-desk-callout" role="note">
      <div className="finance-desk-callout-title">Money in (one receipt)</div>
      <p>
        Record cash once and split it across trust hold, fee revenue, and disbursement float.
        Trust destination is the default. Fee bank is for banked firm fees. Business Cash Book is
        for firm fee cash still on hand (not trust money). Trust and fee ledgers stay separate;
        the same cash is never double-counted.
      </p>
      <p className="finance-desk-callout-link">
        <Link href="/finance/trust">Trust</Link>
        <span className="muted"> · </span>
        <Link href="/finance/client-accounts">Client accounts</Link>
        <span className="muted"> · </span>
        <Link href="/finance/invoicing">Invoicing</Link>
      </p>
    </div>
  );
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
  const [amountDollars, setAmountDollars] = useState("");
  const [destination, setDestination] = useState<PaymentDestination>("trust_bank");
  const [trustAccountId, setTrustAccountId] = useState("");
  const [method, setMethod] = useState("Bank");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([newLine("trust_hold")]);

  const amountCents = dollarsToCentsLocal(amountDollars);
  const isSplit = lines.length > 1;
  const lineSumCents = useMemo(
    () =>
      isSplit
        ? lines.reduce((sum, line) => sum + dollarsToCentsLocal(line.amountDollars), 0)
        : amountCents,
    [lines, isSplit, amountCents],
  );
  const usedLineCount = isSplit
    ? lines.filter((line) => dollarsToCentsLocal(line.amountDollars) > 0).length
    : 1;
  const splitOk = amountCents > 0 && usedLineCount > 0 && lineSumCents === amountCents;
  const feesOnly = isFeesOnlyUi(destination);
  const feeChoiceMissing =
    feesOnly &&
    lines.some(
      (line) =>
        (!isSplit || dollarsToCentsLocal(line.amountDollars) > 0) &&
        (!line.feeMode || (line.feeMode === "invoice" && !line.invoiceId)),
    );

  function startSplit() {
    setLines((prev) => {
      const first = prev.length === 1 && !prev[0].amountDollars ? { ...prev[0], amountDollars } : prev[0];
      return [
        first,
        ...prev.slice(1),
        newLine(isFeesOnlyUi(destination) ? "fee_revenue" : "trust_hold"),
      ];
    });
  }

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
    if (payload.migrationNeeded && payload.migrationHint) {
      setError(String(payload.migrationHint));
    }
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
    if (isFeesOnlyUi(destination)) {
      setTrustAccountId("");
      setLines((prev) =>
        prev.map((line) => ({ ...line, lineType: "fee_revenue" as const })),
      );
      if (destination === "fee_vault") setMethod("Cash");
    }
  }, [destination]);

  useEffect(() => {
    if (isFeesOnlyUi(destination)) return;
    if (trustAccountId) return;
    const first = trustAccountsForDestination[0];
    if (first) setTrustAccountId(first.id);
  }, [destination, trustAccountId, trustAccountsForDestination]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!splitOk || !clientId || feeChoiceMissing) return;
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
          trustAccountId: isFeesOnlyUi(destination) ? null : trustAccountId,
          method: method || null,
          reference: reference || null,
          notes: notes || null,
          lines: lines
            .filter((line) => !isSplit || line.amountDollars.trim() !== "")
            .map((line) => ({
              lineType: line.lineType,
              feeCategory: line.lineType === "fee_revenue" ? line.feeCategory : null,
              amountDollars: isSplit ? line.amountDollars : amountDollars,
              invoiceId: feesOnly && line.feeMode !== "invoice" ? null : line.invoiceId || null,
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
      setAmountDollars("");
      setReference("");
      setNotes("");
      setLines([newLine(isFeesOnlyUi(destination) ? "fee_revenue" : "trust_hold")]);
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

  const sortAccessors = useMemo(
    () => ({
      receipt: (r: IntakeItem) => r.receiptNumber ?? "",
      date: (r: IntakeItem) => r.receivedAt,
      client: (r: IntakeItem) => r.clientName,
      destination: (r: IntakeItem) => destinationLabel(r.destination),
      amount: (r: IntakeItem) => r.amountCents,
      lines: (r: IntakeItem) => r.lineCount,
    }),
    [],
  );
  const { sortedRows, sortKey, sortDir, toggleSort } = useTableSort(items, sortAccessors, {
    key: "date",
    dir: "desc",
  });

  return (
    <section className="view active scrollable finance-desk-view" aria-label="Receipts / Receivables">
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Receipts / Receivables</h3>
            <p className="panel-subtitle muted">Cash in · split to trust / fees · one receipt</p>
          </div>
          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", alignItems: "center" }}>
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
              <Button
                type="button"
                size="sm"
                variant={formOpen ? "outline" : "primary"}
                onClick={() => setFormOpen((v) => !v)}
              >
                {formOpen ? "Close form" : "New receipt"}
              </Button>
            </Can>
          </div>
        </div>

        <div className="panel-body">
          <PaymentMoneyCallout />

          {error ? (
            <div className="finance-status-banner finance-status-banner-error" role="alert">
              {error}
            </div>
          ) : null}

          {formOpen ? (
            <form onSubmit={onSubmit} className="finance-intake-form">
              <div className="finance-intake-form-head">
                <h4>New receipt</h4>
                <p className="muted">
                  One purpose? Just choose the type below; it takes the full amount. Splitting is
                  optional: enter 0 on a split line to show it on the receipt as not used (no
                  entry is posted); a blank split line is left out.
                </p>
              </div>

              <div className="finance-form-grid">
                <label>
                  <span>Client</span>
                  <select
                    className="filter-select"
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
                  <span>Matter (optional)</span>
                  <select
                    className="filter-select"
                    value={matterId}
                    onChange={(e) => setMatterId(e.target.value)}
                  >
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
                  <span>Received date</span>
                  <input
                    className="filter-select"
                    type="date"
                    required
                    value={receivedAt}
                    onChange={(e) => setReceivedAt(e.target.value)}
                  />
                </label>
                <label>
                  <span>Cash received ({currency})</span>
                  <input
                    className="filter-select"
                    required
                    inputMode="decimal"
                    placeholder="0.00"
                    value={amountDollars}
                    onChange={(e) => setAmountDollars(e.target.value)}
                  />
                </label>
                <label>
                  <span>Destination</span>
                  <select
                    className="filter-select"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value as PaymentDestination)}
                  >
                    <option value="trust_bank">Trust bank (default)</option>
                    <option value="trust_vault">Trust vault</option>
                    <option value="fee_bank">Fee bank (fees only)</option>
                    <option value="fee_vault">Business Cash Book (cash fees on hand)</option>
                  </select>
                </label>
                {!isFeesOnlyUi(destination) ? (
                  <label>
                    <span>Trust account</span>
                    <select
                      className="filter-select"
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
                  <span>Method</span>
                  <input
                    className="filter-select"
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                    placeholder="Bank, cash, transfer…"
                  />
                </label>
                <label>
                  <span>Bank / payer reference</span>
                  <input
                    className="filter-select"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="Optional"
                  />
                </label>
                <label className="finance-form-grid-span">
                  <span>Notes</span>
                  <input
                    className="filter-select"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Optional"
                  />
                </label>
              </div>

              <div className="finance-allocation-block">
                <div className="finance-allocation-head">
                  <div>
                    <h4>{isSplit ? "Allocation split" : "What is this money for?"}</h4>
                    <p className="muted">
                      {feesOnly
                        ? "Firm money. If the client owes on an invoice, choose \"Pays an invoice\" so their balance goes down. Use \"New fee\" only for work that was never invoiced."
                        : isSplit
                        ? "Each line is trust hold, disbursement float, or fee revenue. Lines must add up to the cash received."
                        : "Trust hold, disbursement float, or fee revenue. Split only if the money covers more than one purpose."}
                    </p>
                  </div>
                  <div className="finance-allocation-actions">
                    {isSplit ? (
                      <Badge tone={splitOk ? "open" : "pending"}>
                        Lines {centsToDisplay(lineSumCents, currency)} / cash{" "}
                        {centsToDisplay(amountCents, currency)}
                      </Badge>
                    ) : null}
                    <Button type="button" size="sm" variant="outline" onClick={startSplit}>
                      {isSplit ? "Add line" : "Split into lines"}
                    </Button>
                    {isSplit ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setLines((prev) => [prev[0]])}
                      >
                        Don&apos;t split
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="finance-allocation-rows">
                  {lines.map((line, index) => {
                    const unused = isSplit && dollarsToCentsLocal(line.amountDollars) === 0;
                    return (
                    <div
                      key={line.key}
                      className="finance-allocation-row"
                      style={unused ? { opacity: 0.55 } : undefined}
                    >
                      {feesOnly ? (
                        <label>
                          <span>This money</span>
                          <select
                            className="filter-select"
                            value={line.feeMode}
                            onChange={(e) => {
                              const feeMode = e.target.value as DraftLine["feeMode"];
                              setLines((prev) =>
                                prev.map((row, i) =>
                                  i === index
                                    ? { ...row, feeMode, invoiceId: feeMode === "invoice" ? row.invoiceId : "" }
                                    : row,
                                ),
                              );
                            }}
                          >
                            <option value="">Choose…</option>
                            <option value="invoice">Pays an invoice (debtor)</option>
                            <option value="direct">New fee, no invoice</option>
                          </select>
                        </label>
                      ) : (
                      <label>
                        <span>Type</span>
                        <select
                          className="filter-select"
                          value={line.lineType}
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
                      )}
                      {line.lineType === "fee_revenue" ? (
                        <label>
                          <span>Fee category</span>
                          <select
                            className="filter-select"
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
                      ) : (
                        <label>
                          <span>Line note</span>
                          <input
                            className="filter-select"
                            value={line.notes}
                            onChange={(e) => {
                              const notesValue = e.target.value;
                              setLines((prev) =>
                                prev.map((row, i) =>
                                  i === index ? { ...row, notes: notesValue } : row,
                                ),
                              );
                            }}
                            placeholder="Optional"
                          />
                        </label>
                      )}
                      <label>
                        <span>
                          Amount
                          {unused ? (
                            <em className="muted">
                              {line.amountDollars.trim()
                                ? " · not used, shows as 0.00 on receipt"
                                : " · blank, left out"}
                            </em>
                          ) : null}
                        </span>
                        <input
                          className="filter-select"
                          inputMode="decimal"
                          placeholder="0.00"
                          disabled={!isSplit}
                          title={isSplit ? undefined : "Takes the full cash received"}
                          value={isSplit ? line.amountDollars : amountDollars}
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
                      {feesOnly && line.feeMode === "invoice" ? (
                        <label>
                          <span>Invoice being paid</span>
                          <select
                            className="filter-select"
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
                            <option value="">
                              {clientId
                                ? clientInvoices.length
                                  ? "Choose invoice…"
                                  : "No invoices for this client"
                                : "Pick the client first"}
                            </option>
                            {clientInvoices.map((inv) => (
                              <option key={inv.id} value={inv.id}>
                                {inv.invoiceNumber} ·{" "}
                                {centsToDisplay(inv.totalCents, inv.currency)}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : !feesOnly && line.lineType === "fee_revenue" ? (
                        <label>
                          <span>Invoice (optional)</span>
                          <select
                            className="filter-select"
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
                        <div className="finance-allocation-spacer" aria-hidden />
                      )}
                      <div className="finance-allocation-row-action">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={lines.length <= 1}
                          onClick={() =>
                            setLines((prev) => prev.filter((_, i) => i !== index))
                          }
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>

              <div className="finance-intake-form-foot">
                <Button type="submit" disabled={saving || !splitOk || !clientId || feeChoiceMissing}>
                  {saving ? "Saving…" : "Record receipt"}
                </Button>
                {feeChoiceMissing && amountCents > 0 ? (
                  <span className="muted">
                    For each line, choose whether it pays an invoice or is a new fee, and pick the
                    invoice being paid.
                  </span>
                ) : !splitOk && amountCents > 0 && isSplit ? (
                  <span className="muted">
                    {usedLineCount === 0
                      ? "Give at least one line an amount."
                      : `Split lines add up to ${centsToDisplay(lineSumCents, currency)}; they must equal the cash received.`}
                  </span>
                ) : null}
              </div>
            </form>
          ) : null}

          <div className="toolbar finance-filter-toolbar">
            <label className="finance-filter-field">
              <span>Client</span>
              <select
                className="filter-select"
                value={filterClientId}
                onChange={(e) => setFilterClientId(e.target.value)}
              >
                <option value="">All clients</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="finance-filter-field">
              <span>Destination</span>
              <select
                className="filter-select"
                value={filterDestination}
                onChange={(e) => setFilterDestination(e.target.value)}
              >
                <option value="">All</option>
                <option value="trust_bank">Trust bank</option>
                <option value="trust_vault">Trust vault</option>
                <option value="fee_bank">Fee bank</option>
                <option value="fee_vault">Business Cash Book</option>
              </select>
            </label>
            <label className="finance-filter-field">
              <span>From</span>
              <input
                className="filter-select"
                type="date"
                value={filterFrom}
                onChange={(e) => setFilterFrom(e.target.value)}
              />
            </label>
            <label className="finance-filter-field">
              <span>To</span>
              <input
                className="filter-select"
                type="date"
                value={filterTo}
                onChange={(e) => setFilterTo(e.target.value)}
              />
            </label>
            <span className="toolbar-spacer" />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={loading}
              onClick={() => void loadRegister()}
            >
              {loading ? "Loading…" : "Refresh"}
            </Button>
          </div>

          {loading && items.length === 0 ? (
            <p className="muted">Loading payments…</p>
          ) : items.length === 0 ? (
            <EmptyState
              title="No payment intakes yet"
              detail="Use New payment to record a cash receipt and split it across trust hold, fees, and disbursement float."
            />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <SortableTh
                      label="Receipt"
                      columnKey="receipt"
                      activeKey={sortKey}
                      direction={sortDir}
                      onSort={toggleSort}
                    />
                    <SortableTh
                      label="Date"
                      columnKey="date"
                      activeKey={sortKey}
                      direction={sortDir}
                      onSort={toggleSort}
                    />
                    <SortableTh
                      label="Client"
                      columnKey="client"
                      activeKey={sortKey}
                      direction={sortDir}
                      onSort={toggleSort}
                    />
                    <SortableTh
                      label="Destination"
                      columnKey="destination"
                      activeKey={sortKey}
                      direction={sortDir}
                      onSort={toggleSort}
                    />
                    <SortableTh
                      label="Amount"
                      columnKey="amount"
                      activeKey={sortKey}
                      direction={sortDir}
                      onSort={toggleSort}
                      className="num"
                      align="right"
                    />
                    <SortableTh
                      label="Lines"
                      columnKey="lines"
                      activeKey={sortKey}
                      direction={sortDir}
                      onSort={toggleSort}
                      className="num"
                      align="right"
                    />
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.receiptNumber ?? "—"}</strong>
                      </td>
                      <td>
                        {new Date(item.receivedAt).toLocaleDateString(undefined, {
                          dateStyle: "medium",
                        })}
                      </td>
                      <td>
                        {item.clientName}
                        {item.clientNumber ? (
                          <div className="muted">{item.clientNumber}</div>
                        ) : null}
                        {item.matterNumber ? (
                          <div className="muted">{item.matterNumber}</div>
                        ) : null}
                      </td>
                      <td>{destinationLabel(item.destination)}</td>
                      <td className="num">
                        {centsToDisplay(item.amountCents, item.currency)}
                      </td>
                      <td className="num">{item.lineCount}</td>
                      <td>
                        <a
                          className="btn btn-ghost btn-sm"
                          href={`/api/export/payment_intake?id=${encodeURIComponent(item.id)}&format=pdf`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Receipt
                        </a>
                        {item.reversedAt ? (
                          <Badge tone="closed" title={item.reversalReason ?? undefined}>
                            Reversed
                          </Badge>
                        ) : (
                          <Can permission="finance.payments.create">
                            <ReasonActionButton
                              label="Reverse"
                              title="Reverse payment"
                              explanation="Unwinds every posting from this payment: trust receipts, fee receipts, invoice allocations and ledger entries. The original record stays, marked reversed. It will not go through if the client's trust money has already been spent."
                              url={`/api/finance/payments/${item.id}/reverse`}
                              successMessage="Payment reversed."
                              onDone={() => loadRegister().catch(() => undefined)}
                              variant="ghost"
                            />
                          </Can>
                        )}
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
