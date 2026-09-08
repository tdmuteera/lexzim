"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { centsToDisplay } from "@/lib/billing/money";

type IndexRow = {
  clientId: string;
  clientNumber: string;
  displayName: string;
  currency: string;
  trustBalanceCents: number;
  feesBilledCents: number;
  feesPaidCents: number;
  feesOutstandingCents: number;
  unbilledDisbursementCents: number;
  intakeCount: number;
};

type AccountDetail = {
  client: {
    id: string;
    clientNumber: string;
    displayName: string;
    currency: string;
  };
  labels: { trust: string; fees: string; disbursements: string };
  trust: {
    balanceCents: number;
    recentMovements: Array<{
      id: string;
      occurredAt: string;
      entryType: string;
      amountCents: number;
      runningBalanceCents: number;
      accountName: string;
      matterTitle: string | null;
      referenceNumber: string | null;
      narrative: string | null;
    }>;
  };
  fees: {
    billedCents: number;
    paidCents: number;
    outstandingCents: number;
    retainerAppliedCents: number;
    invoices: Array<{
      id: string;
      invoiceNumber: string;
      status: string;
      matterTitle: string | null;
      matterNumber: string | null;
      totalCents: number;
      paidCents: number;
      balanceCents: number;
      currency: string;
    }>;
    feePayments: Array<{
      id: string;
      invoiceNumber: string | null;
      receiptNumber: string | null;
      amountCents: number;
      currency: string;
      paidAt: string;
      method: string | null;
    }>;
  };
  disbursements: {
    unbilledCents: number;
    unbilled: Array<{
      id: string;
      matterTitle: string | null;
      matterNumber: string | null;
      description: string;
      amountCents: number;
      currency: string;
      incurredAt: string;
      paidFrom: string | null;
    }>;
  };
  paymentIntakes: Array<{
    id: string;
    receiptNumber: string | null;
    receivedAt: string;
    amountCents: number;
    currency: string;
    destination: string;
    matterTitle: string | null;
    matterNumber: string | null;
    lineCount: number;
  }>;
  recoverableRequisitions: Array<{
    id: string;
    description: string;
    amountCents: number;
    currency: string;
    matterTitle: string | null;
    matterNumber: string | null;
    paidAt: string | null;
  }>;
};

function destinationLabel(destination: string): string {
  if (destination === "trust_bank") return "Trust bank";
  if (destination === "trust_vault") return "Trust vault";
  if (destination === "fee_bank") return "Fee bank";
  if (destination === "fee_vault") return "Fee vault";
  return destination;
}

export function ClientAccountsView() {
  const { user } = useAuth();
  const currency = user?.firm?.defaultCurrency || "USD";

  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [items, setItems] = useState<IndexRow[]>([]);
  const [visibility, setVisibility] = useState<"all" | "assigned">("assigned");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AccountDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const loadIndex = useCallback(async () => {
    setError(null);
    const params = new URLSearchParams();
    if (debouncedQ) params.set("q", debouncedQ);
    const res = await fetch(`/api/finance/client-accounts?${params}`, {
      credentials: "include",
    });
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      data?: { items?: IndexRow[]; visibility?: string };
      error?: { message?: string };
    };
    if (!res.ok || body.ok === false) {
      throw new Error(body.error?.message || "Could not load client accounts.");
    }
    const payload = body.data ?? (body as unknown as { items?: IndexRow[]; visibility?: string });
    setItems(payload.items ?? []);
    setVisibility(payload.visibility === "all" ? "all" : "assigned");
  }, [debouncedQ]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await loadIndex();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadIndex]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setDetailLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/finance/client-accounts/${selectedId}`, {
          credentials: "include",
        });
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          data?: { account?: AccountDetail };
          error?: { message?: string };
        };
        if (!res.ok || body.ok === false) {
          throw new Error(body.error?.message || "Could not load client account.");
        }
        if (!cancelled) {
          setDetail(body.data?.account ?? null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load detail.");
          setDetail(null);
        }
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  return (
    <section className="view active scrollable finance-desk-view" aria-label="Client accounts">
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Client accounts</h3>
            <p className="panel-subtitle muted">Trust · fees · disbursements per client</p>
          </div>
          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", alignItems: "center" }}>
            <Link href="/finance/payments" className="btn btn-ghost btn-sm">
              Payments
            </Link>
            <Link href="/finance/trust" className="btn btn-ghost btn-sm">
              Trust
            </Link>
            <Link href="/finance/requisitions" className="btn btn-ghost btn-sm">
              Requisitions
            </Link>
            <Badge tone={visibility === "all" ? "open" : "pending"}>
              {visibility === "all" ? "All clients (finance)" : "Assigned clients only"}
            </Badge>
          </div>
        </div>
        <div className="panel-body">
          <div className="finance-desk-callout" role="note">
            <div className="finance-desk-callout-title">Client money vs firm fees</div>
            <p>
              Bookkeeper view of each client&apos;s trust balance, fee billing, unbilled
              disbursements, and payment intakes. Trust money stays separate from firm fee
              revenue.
            </p>
          </div>

          {error ? (
            <div className="finance-status-banner finance-status-banner-error" role="alert">
              {error}
            </div>
          ) : null}

          {!selectedId ? (
            <>
              <label className="finance-filter-field" style={{ maxWidth: 360, marginBottom: "0.85rem" }}>
                <span>Search clients</span>
                <input
                  className="filter-select"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Name or client number"
                />
              </label>

              {loading ? (
                <p className="muted">Loading client accounts…</p>
              ) : items.length === 0 ? (
                <EmptyState
                  title="No clients in this view"
                  detail={
                    visibility === "assigned"
                      ? "You only see assigned clients here unless you have finance client-accounts access."
                      : "No active clients matched your search."
                  }
                />
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Client</th>
                        <th>Trust balance</th>
                        <th>Fees outstanding</th>
                        <th>Unbilled disbursements</th>
                        <th>Intakes</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((row) => (
                        <tr key={row.clientId}>
                          <td>
                            <strong>{row.displayName}</strong>
                            <div className="muted">{row.clientNumber}</div>
                          </td>
                          <td>{centsToDisplay(row.trustBalanceCents, row.currency || currency)}</td>
                          <td>
                            {centsToDisplay(row.feesOutstandingCents, row.currency || currency)}
                            <div className="muted">
                              Billed {centsToDisplay(row.feesBilledCents, row.currency || currency)}
                            </div>
                          </td>
                          <td>
                            {centsToDisplay(
                              row.unbilledDisbursementCents,
                              row.currency || currency,
                            )}
                          </td>
                          <td>{row.intakeCount}</td>
                          <td>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedId(row.clientId)}
                            >
                              Open
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1rem" }}>
                <Button type="button" variant="ghost" onClick={() => setSelectedId(null)}>
                  ← Back to list
                </Button>
                <Link href={`/clients/${selectedId}`} className="btn btn-ghost btn-sm">
                  Client record
                </Link>
                <Link href="/finance/trust" className="btn btn-ghost btn-sm">
                  Trust desk
                </Link>
                <Link href="/finance/payments" className="btn btn-ghost btn-sm">
                  Payments
                </Link>
              </div>

              {detailLoading || !detail ? (
                <p className="muted">Loading account…</p>
              ) : (
                <div className="stack" style={{ display: "grid", gap: "1rem" }}>
                  <div>
                    <h4 style={{ margin: "0 0 0.25rem" }}>{detail.client.displayName}</h4>
                    <p className="muted" style={{ margin: 0 }}>
                      {detail.client.clientNumber}
                    </p>
                  </div>

                  <div className="finance-kpi-strip">
                    <div className="finance-kpi-card">
                      <span className="muted">{detail.labels.trust}</span>
                      <strong>
                        {centsToDisplay(detail.trust.balanceCents, detail.client.currency)}
                      </strong>
                    </div>
                    <div className="finance-kpi-card">
                      <span className="muted">{detail.labels.fees}</span>
                      <strong>
                        {centsToDisplay(detail.fees.outstandingCents, detail.client.currency)}{" "}
                        outstanding
                      </strong>
                      <div className="muted" style={{ marginTop: "0.35rem", textTransform: "none", letterSpacing: 0 }}>
                        Billed {centsToDisplay(detail.fees.billedCents, detail.client.currency)} ·
                        Collected {centsToDisplay(detail.fees.paidCents, detail.client.currency)}
                      </div>
                    </div>
                    <div className="finance-kpi-card">
                      <span className="muted">{detail.labels.disbursements}</span>
                      <strong>
                        {centsToDisplay(
                          detail.disbursements.unbilledCents,
                          detail.client.currency,
                        )}{" "}
                        unbilled
                      </strong>
                    </div>
                  </div>

                  <section>
                    <h4>Trust movements (recent)</h4>
                    {detail.trust.recentMovements.length === 0 ? (
                      <p className="muted">No trust ledger movements yet.</p>
                    ) : (
                      <div className="table-wrap">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Type</th>
                              <th>Amount</th>
                              <th>Running</th>
                              <th>Account</th>
                              <th>Ref</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detail.trust.recentMovements.map((m) => (
                              <tr key={m.id}>
                                <td>
                                  {new Date(m.occurredAt).toLocaleDateString(undefined, {
                                    dateStyle: "medium",
                                  })}
                                </td>
                                <td>{m.entryType}</td>
                                <td>
                                  {centsToDisplay(m.amountCents, detail.client.currency)}
                                </td>
                                <td>
                                  {centsToDisplay(m.runningBalanceCents, detail.client.currency)}
                                </td>
                                <td>
                                  {m.accountName}
                                  {m.matterTitle ? (
                                    <div className="muted">{m.matterTitle}</div>
                                  ) : null}
                                </td>
                                <td>{m.referenceNumber ?? "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>

                  <section>
                    <h4>Fee invoices</h4>
                    {detail.fees.invoices.length === 0 ? (
                      <p className="muted">No fee invoices for this client.</p>
                    ) : (
                      <div className="table-wrap">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Invoice</th>
                              <th>Status</th>
                              <th>Total</th>
                              <th>Paid</th>
                              <th>Balance</th>
                              <th>Matter</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detail.fees.invoices.map((inv) => (
                              <tr key={inv.id}>
                                <td>
                                  <Link href={`/finance/invoicing/invoices/${inv.id}`}>
                                    {inv.invoiceNumber}
                                  </Link>
                                </td>
                                <td>{inv.status}</td>
                                <td>{centsToDisplay(inv.totalCents, inv.currency)}</td>
                                <td>{centsToDisplay(inv.paidCents, inv.currency)}</td>
                                <td>{centsToDisplay(inv.balanceCents, inv.currency)}</td>
                                <td>
                                  {inv.matterNumber
                                    ? `${inv.matterNumber} · ${inv.matterTitle ?? ""}`
                                    : inv.matterTitle ?? "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>

                  <section>
                    <h4>Fee receipts</h4>
                    {detail.fees.feePayments.length === 0 ? (
                      <p className="muted">No fee receipts yet.</p>
                    ) : (
                      <div className="table-wrap">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Receipt</th>
                              <th>Invoice</th>
                              <th>Date</th>
                              <th>Amount</th>
                              <th>Method</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detail.fees.feePayments.map((p) => (
                              <tr key={p.id}>
                                <td>
                                  {p.receiptNumber ? (
                                    <a
                                      href={`/api/export/receipt?id=${encodeURIComponent(p.id)}&format=pdf`}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      {p.receiptNumber}
                                    </a>
                                  ) : (
                                    "—"
                                  )}
                                </td>
                                <td>{p.invoiceNumber ?? "—"}</td>
                                <td>
                                  {new Date(p.paidAt).toLocaleDateString(undefined, {
                                    dateStyle: "medium",
                                  })}
                                </td>
                                <td>{centsToDisplay(p.amountCents, p.currency)}</td>
                                <td>{p.method ?? "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>

                  <section>
                    <h4>Unbilled disbursements</h4>
                    {detail.disbursements.unbilled.length === 0 ? (
                      <p className="muted">No unbilled client costs.</p>
                    ) : (
                      <div className="table-wrap">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Description</th>
                              <th>Amount</th>
                              <th>Matter</th>
                              <th>Paid from</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detail.disbursements.unbilled.map((d) => (
                              <tr key={d.id}>
                                <td>
                                  {new Date(d.incurredAt).toLocaleDateString(undefined, {
                                    dateStyle: "medium",
                                  })}
                                </td>
                                <td>{d.description}</td>
                                <td>{centsToDisplay(d.amountCents, d.currency)}</td>
                                <td>
                                  {d.matterNumber
                                    ? `${d.matterNumber} · ${d.matterTitle ?? ""}`
                                    : d.matterTitle ?? "—"}
                                </td>
                                <td>{d.paidFrom ?? "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>

                  <section>
                    <h4>Payment intakes</h4>
                    {detail.paymentIntakes.length === 0 ? (
                      <p className="muted">No Payments intakes for this client.</p>
                    ) : (
                      <div className="table-wrap">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Receipt</th>
                              <th>Date</th>
                              <th>Destination</th>
                              <th>Amount</th>
                              <th>Lines</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detail.paymentIntakes.map((intake) => (
                              <tr key={intake.id}>
                                <td>
                                  {intake.receiptNumber ? (
                                    <a
                                      href={`/api/export/payment_intake?id=${encodeURIComponent(intake.id)}&format=pdf`}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      {intake.receiptNumber}
                                    </a>
                                  ) : (
                                    "—"
                                  )}
                                </td>
                                <td>
                                  {new Date(intake.receivedAt).toLocaleDateString(undefined, {
                                    dateStyle: "medium",
                                  })}
                                </td>
                                <td>{destinationLabel(intake.destination)}</td>
                                <td>
                                  {centsToDisplay(intake.amountCents, intake.currency)}
                                </td>
                                <td>{intake.lineCount}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>

                  <section>
                    <h4>Recoverable firm-float disbursements</h4>
                    {(detail.recoverableRequisitions ?? []).length === 0 ? (
                      <p className="muted">No open recoverable requisitions.</p>
                    ) : (
                      <div className="table-wrap">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Paid</th>
                              <th>Description</th>
                              <th>Amount</th>
                              <th>Matter</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {detail.recoverableRequisitions.map((r) => (
                              <tr key={r.id}>
                                <td>
                                  {r.paidAt
                                    ? new Date(r.paidAt).toLocaleDateString(undefined, {
                                        dateStyle: "medium",
                                      })
                                    : "—"}
                                </td>
                                <td>{r.description}</td>
                                <td>{centsToDisplay(r.amountCents, r.currency)}</td>
                                <td>
                                  {r.matterNumber
                                    ? `${r.matterNumber} · ${r.matterTitle ?? ""}`
                                    : r.matterTitle ?? "—"}
                                </td>
                                <td>
                                  <Link href={`/finance/requisitions?id=${r.id}`}>
                                    Open
                                  </Link>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
