"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { Can } from "@/components/auth/Can";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { centsToDisplay } from "@/lib/billing/money";

type Requisition = {
  id: string;
  type: string;
  status: string;
  clientId: string | null;
  clientName: string | null;
  matterId: string | null;
  matterTitle: string | null;
  matterNumber: string | null;
  nature: string | null;
  description: string;
  amountCents: number;
  currency: string;
  requesterName: string | null;
  paidFrom: string | null;
  recoverable: boolean;
  rejectionNote: string | null;
  createdAt: string;
};

type ClientOption = { id: string; label: string };
type MatterOption = {
  id: string;
  title: string;
  matterNumber: string | null;
  clientId: string;
};
type TrustAccountOption = { id: string; name: string; accountKind: string };

function statusTone(status: string) {
  if (status === "approved" || status === "paid") return "open" as const;
  if (status === "pending_approval") return "pending" as const;
  if (status === "rejected" || status === "cancelled") return "danger" as const;
  return "default" as const;
}

function RequisitionCallout() {
  return (
    <div className="finance-desk-callout" role="note">
      <div className="finance-desk-callout-title">Business vs disbursement</div>
      <p>
        <strong>Business</strong> requests are firm operating costs (pay from operating → Expenses).{" "}
        <strong>Disbursement</strong> requests need Client then Matter (pay from trust or firm float).
        Firm float shortfalls can be marked recoverable until the client tops up.
      </p>
      <p className="finance-desk-callout-link">
        <Link href="/finance/expenses">Expenses</Link>
        <span className="muted"> · </span>
        <Link href="/finance/client-accounts">Client accounts</Link>
        <span className="muted"> · </span>
        <Link href="/finance/payments">Payments</Link>
      </p>
    </div>
  );
}

export function RequisitionsView() {
  const { user } = useAuth();
  const currency = user?.firm?.defaultCurrency || "USD";
  const searchParams = useSearchParams();
  const focusId = searchParams.get("id");

  const [items, setItems] = useState<Requisition[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [matters, setMatters] = useState<MatterOption[]>([]);
  const [accounts, setAccounts] = useState<TrustAccountOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(focusId);
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [formOpen, setFormOpen] = useState(false);

  const [reqType, setReqType] = useState<"business" | "disbursement">("business");
  const [nature, setNature] = useState("Electricity");
  const [description, setDescription] = useState("");
  const [amountDollars, setAmountDollars] = useState("");
  const [clientId, setClientId] = useState("");
  const [matterId, setMatterId] = useState("");

  const [payFrom, setPayFrom] = useState<"operating" | "trust" | "firm_float">("operating");
  const [trustAccountId, setTrustAccountId] = useState("");
  const [paymentRef, setPaymentRef] = useState("");
  const [rejectNote, setRejectNote] = useState("");
  const [trustPreview, setTrustPreview] = useState<{
    trustBalanceCents: number | null;
    shortfallCents: number | null;
    message: string | null;
    allowFirmFloat: boolean;
    blockIfShort: boolean;
  } | null>(null);

  const selected = useMemo(
    () => items.find((r) => r.id === selectedId) ?? null,
    [items, selectedId],
  );

  const clientMatters = useMemo(
    () => matters.filter((m) => !clientId || m.clientId === clientId),
    [matters, clientId],
  );

  const load = useCallback(async () => {
    setError(null);
    const params = new URLSearchParams();
    if (filterType) params.set("type", filterType);
    if (filterStatus === "recoverable") {
      params.set("recoverable", "1");
    } else if (filterStatus) {
      params.set("status", filterStatus);
    }
    const res = await fetch(`/api/finance/requisitions?${params}`, {
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || "Could not load requisitions.");
    const payload = data.data ?? data;
    setItems(payload.items ?? []);
  }, [filterType, filterStatus]);

  const loadLookups = useCallback(async () => {
    const [cRes, mRes, aRes] = await Promise.all([
      fetch("/api/clients?archived=active", { credentials: "include" }),
      fetch("/api/matters?bucket=all", { credentials: "include" }),
      fetch("/api/trust/accounts?active=all", { credentials: "include" }),
    ]);
    if (cRes.ok) {
      const data = await cRes.json();
      const payload = data.data ?? data;
      setClients(
        (payload.items ?? []).map(
          (c: { id: string; displayName?: string; clientNumber?: string }) => ({
            id: c.id,
            label: c.displayName || c.clientNumber || c.id.slice(0, 8),
          }),
        ),
      );
    }
    if (mRes.ok) {
      const data = await mRes.json();
      const payload = data.data ?? data;
      setMatters(
        (payload.items ?? []).map(
          (m: {
            id: string;
            title: string;
            matterNumber?: string | null;
            clientId: string;
          }) => ({
            id: m.id,
            title: m.title,
            matterNumber: m.matterNumber ?? null,
            clientId: m.clientId,
          }),
        ),
      );
    }
    if (aRes.ok) {
      const data = await aRes.json();
      const payload = data.data ?? data;
      setAccounts(
        (payload.items ?? payload.accounts ?? [])
          .filter((a: { isActive?: boolean }) => a.isActive !== false)
          .map((a: { id: string; name: string; accountKind: string }) => ({
            id: a.id,
            name: a.name,
            accountKind: a.accountKind,
          })),
      );
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await Promise.all([load(), loadLookups()]);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load, loadLookups]);

  useEffect(() => {
    if (focusId) setSelectedId(focusId);
  }, [focusId]);

  useEffect(() => {
    if (!selected || selected.status !== "approved" || selected.type !== "disbursement") {
      setTrustPreview(null);
      setPayFrom(selected?.type === "business" ? "operating" : "trust");
      return;
    }
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/finance/requisitions/${selected.id}?preview=pay`, {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!cancelled && res.ok) {
        const payload = data.data ?? data;
        setTrustPreview({
          trustBalanceCents: payload.trustBalanceCents ?? null,
          shortfallCents: payload.shortfallCents ?? null,
          message: payload.shortfall?.message ?? payload.approvalTier?.reason ?? null,
          allowFirmFloat: payload.shortfall?.allowFirmFloat !== false,
          blockIfShort: payload.shortfall?.blockIfShort === true,
        });
        const short =
          payload.shortfallCents != null && Number(payload.shortfallCents) > 0;
        setPayFrom(short ? "firm_float" : "trust");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected]);

  useEffect(() => {
    if (reqType === "business") {
      setClientId("");
      setMatterId("");
    }
  }, [reqType]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/finance/requisitions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: reqType,
          nature: reqType === "business" ? nature : null,
          description,
          amountDollars,
          currency,
          clientId: reqType === "disbursement" ? clientId : null,
          matterId: reqType === "disbursement" ? matterId : null,
          submit: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message || "Could not create requisition.");
      const payload = data.data ?? data;
      setFormOpen(false);
      setDescription("");
      setAmountDollars("");
      await load();
      if (payload.requisition?.id) setSelectedId(payload.requisition.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed.");
    } finally {
      setSaving(false);
    }
  }

  async function runAction(action: string, extra: Record<string, unknown> = {}) {
    if (!selectedId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/finance/requisitions/${selectedId}/action`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message || `Could not ${action}.`);
      const payload = data.data ?? data;
      if (payload.trustShortfallWarning) {
        setError(payload.trustShortfallWarning);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="view active scrollable finance-desk-view" aria-label="Requisitions">
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Requisitions</h3>
            <p className="panel-subtitle muted">Request · approve · pay · business or disbursement</p>
          </div>
          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", alignItems: "center" }}>
            <Link href="/finance/expenses" className="btn btn-ghost btn-sm">
              Expenses
            </Link>
            <Link href="/finance/client-accounts" className="btn btn-ghost btn-sm">
              Client accounts
            </Link>
            <Can permission="finance.requisitions.request">
              <Button
                type="button"
                size="sm"
                variant={formOpen ? "outline" : "primary"}
                onClick={() => setFormOpen((v) => !v)}
              >
                {formOpen ? "Close form" : "New requisition"}
              </Button>
            </Can>
          </div>
        </div>

        <div className="panel-body">
          <RequisitionCallout />

          {error ? (
            <div className="finance-status-banner finance-status-banner-error" role="alert">
              {error}
            </div>
          ) : null}

          {formOpen ? (
            <form onSubmit={onCreate} className="finance-intake-form">
              <div className="finance-intake-form-head">
                <h4>New requisition</h4>
                <p className="muted">Submitted requests go to the approvals inbox for review.</p>
              </div>
              <div className="finance-form-grid">
                <label>
                  <span>Type</span>
                  <select
                    className="filter-select"
                    value={reqType}
                    onChange={(e) =>
                      setReqType(e.target.value as "business" | "disbursement")
                    }
                  >
                    <option value="business">Business (firm operating)</option>
                    <option value="disbursement">Disbursement (client cost)</option>
                  </select>
                </label>
                {reqType === "business" ? (
                  <label>
                    <span>Nature / category</span>
                    <input
                      className="filter-select"
                      required
                      value={nature}
                      onChange={(e) => setNature(e.target.value)}
                      placeholder="e.g. Electricity, stationery"
                    />
                  </label>
                ) : (
                  <>
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
                      <span>Matter</span>
                      <select
                        className="filter-select"
                        required
                        value={matterId}
                        onChange={(e) => setMatterId(e.target.value)}
                      >
                        <option value="">Select matter</option>
                        {clientMatters.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.matterNumber ? `${m.matterNumber} · ` : ""}
                            {m.title}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
                <label className="finance-form-grid-span">
                  <span>Description</span>
                  <input
                    className="filter-select"
                    required
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What is this for?"
                  />
                </label>
                <label>
                  <span>Amount ({currency})</span>
                  <input
                    className="filter-select"
                    required
                    inputMode="decimal"
                    placeholder="0.00"
                    value={amountDollars}
                    onChange={(e) => setAmountDollars(e.target.value)}
                  />
                </label>
              </div>
              <div className="finance-intake-form-foot">
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving…" : "Submit for approval"}
                </Button>
              </div>
            </form>
          ) : null}

          <div className="toolbar finance-filter-toolbar">
            <label className="finance-filter-field">
              <span>Type</span>
              <select
                className="filter-select"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
              >
                <option value="">All</option>
                <option value="business">Business</option>
                <option value="disbursement">Disbursement</option>
              </select>
            </label>
            <label className="finance-filter-field">
              <span>Status</span>
              <select
                className="filter-select"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="">All</option>
                <option value="draft">Draft</option>
                <option value="pending_approval">Pending approval</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="paid">Paid</option>
                <option value="cancelled">Cancelled</option>
                <option value="recoverable">Recoverable (open)</option>
              </select>
            </label>
            <span className="toolbar-spacer" />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={loading}
              onClick={() => void load()}
            >
              {loading ? "Loading…" : "Refresh"}
            </Button>
          </div>

          {loading && items.length === 0 ? (
            <p className="muted">Loading requisitions…</p>
          ) : items.length === 0 ? (
            <EmptyState
              title="No requisitions"
              detail="Create a business or disbursement request to start the approval flow."
            />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Description</th>
                    <th className="num">Amount</th>
                    <th>Client / matter</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr
                      key={row.id}
                      className={selectedId === row.id ? "row-selected" : undefined}
                    >
                      <td>{row.type === "business" ? "Business" : "Disbursement"}</td>
                      <td>
                        <Badge tone={statusTone(row.status)}>
                          {row.status.replace(/_/g, " ")}
                        </Badge>
                        {row.recoverable ? (
                          <div className="muted">Recoverable</div>
                        ) : null}
                      </td>
                      <td>{row.description}</td>
                      <td className="num">
                        {centsToDisplay(row.amountCents, row.currency)}
                      </td>
                      <td>
                        {row.type === "disbursement"
                          ? `${row.clientName ?? "—"} · ${row.matterNumber ?? row.matterTitle ?? ""}`
                          : row.nature ?? "—"}
                      </td>
                      <td>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedId(row.id)}
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

          {selected ? (
            <div className="finance-intake-form finance-detail-card">
              <div className="finance-intake-form-head">
                <h4>
                  {selected.type === "business" ? "Business" : "Disbursement"} ·{" "}
                  {centsToDisplay(selected.amountCents, selected.currency)}
                </h4>
                <p className="muted">
                  Status: {selected.status.replace(/_/g, " ")}
                  {selected.requesterName ? ` · Requested by ${selected.requesterName}` : ""}
                </p>
              </div>
              <p style={{ margin: 0 }}>{selected.description}</p>
              {selected.rejectionNote ? (
                <div className="finance-status-banner finance-status-banner-error" role="status">
                  Rejection note: {selected.rejectionNote}
                </div>
              ) : null}

              {selected.status === "approved" &&
              selected.type === "disbursement" &&
              trustPreview ? (
                <div
                  className={
                    trustPreview.shortfallCents && trustPreview.shortfallCents > 0
                      ? "finance-status-banner finance-status-banner-warn"
                      : "finance-status-banner"
                  }
                >
                  Client trust:{" "}
                  {centsToDisplay(trustPreview.trustBalanceCents ?? 0, selected.currency)}
                  {" · Requested "}
                  {centsToDisplay(selected.amountCents, selected.currency)}
                  {trustPreview.message ? (
                    <div style={{ marginTop: "0.35rem" }}>
                      {trustPreview.message}
                      {trustPreview.blockIfShort ? " (firm block setting is ON)" : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="finance-form-grid">
                {selected.status === "pending_approval" ? (
                  <Can permission="finance.requisitions.approve">
                    <label className="finance-form-grid-span">
                      <span>Rejection note (if rejecting)</span>
                      <input
                        className="filter-select"
                        placeholder="Optional note for the requester"
                        value={rejectNote}
                        onChange={(e) => setRejectNote(e.target.value)}
                      />
                    </label>
                  </Can>
                ) : null}

                {selected.status === "approved" ? (
                  <Can permission="finance.requisitions.pay">
                    {selected.type === "disbursement" ? (
                      <>
                        <label>
                          <span>Pay from</span>
                          <select
                            className="filter-select"
                            value={payFrom}
                            onChange={(e) =>
                              setPayFrom(e.target.value as "trust" | "firm_float")
                            }
                          >
                            <option value="trust">Client trust</option>
                            <option
                              value="firm_float"
                              disabled={Boolean(
                                trustPreview?.shortfallCents &&
                                  trustPreview.shortfallCents > 0 &&
                                  !trustPreview.allowFirmFloat,
                              )}
                            >
                              Firm float (recoverable)
                            </option>
                          </select>
                        </label>
                        {payFrom === "trust" ? (
                          <label>
                            <span>Trust account</span>
                            <select
                              className="filter-select"
                              value={trustAccountId}
                              onChange={(e) => setTrustAccountId(e.target.value)}
                            >
                              <option value="">Default trust account</option>
                              {accounts.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.name} ({a.accountKind})
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : null}
                      </>
                    ) : null}
                    <label>
                      <span>Payment reference</span>
                      <input
                        className="filter-select"
                        placeholder="Optional"
                        value={paymentRef}
                        onChange={(e) => setPaymentRef(e.target.value)}
                      />
                    </label>
                  </Can>
                ) : null}
              </div>

              <div className="finance-intake-form-foot">
                {selected.status === "draft" || selected.status === "rejected" ? (
                  <Can permission="finance.requisitions.request">
                    <Button
                      type="button"
                      disabled={saving}
                      onClick={() => void runAction("submit")}
                    >
                      Submit
                    </Button>
                  </Can>
                ) : null}

                {selected.status === "pending_approval" ? (
                  <Can permission="finance.requisitions.approve">
                    <Button
                      type="button"
                      disabled={saving}
                      onClick={() => void runAction("approve")}
                    >
                      Approve
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={saving}
                      onClick={() =>
                        void runAction("reject", { rejectionNote: rejectNote })
                      }
                    >
                      Reject
                    </Button>
                  </Can>
                ) : null}

                {selected.status === "approved" ? (
                  <Can permission="finance.requisitions.pay">
                    {selected.type === "business" ? (
                      <Button
                        type="button"
                        disabled={saving}
                        onClick={() =>
                          void runAction("pay", {
                            paidFrom: "operating",
                            paymentRef: paymentRef || null,
                          })
                        }
                      >
                        Pay from operating
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        disabled={saving}
                        onClick={() =>
                          void runAction("pay", {
                            paidFrom: payFrom,
                            trustAccountId: trustAccountId || null,
                            paymentRef: paymentRef || null,
                          })
                        }
                      >
                        Record payment
                      </Button>
                    )}
                  </Can>
                ) : null}

                {selected.status === "paid" && selected.recoverable ? (
                  <Can permission="finance.requisitions.pay">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={saving}
                      onClick={() => void runAction("settle_recoverable")}
                    >
                      Mark recoverable settled
                    </Button>
                  </Can>
                ) : null}

                {selected.status !== "paid" && selected.status !== "cancelled" ? (
                  <Can permission="finance.requisitions.request">
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={saving}
                      onClick={() => void runAction("cancel")}
                    >
                      Cancel
                    </Button>
                  </Can>
                ) : null}

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedId(null)}
                >
                  Close detail
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
