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
    setItems(data.items ?? []);
  }, [filterType, filterStatus]);

  const loadLookups = useCallback(async () => {
    const [cRes, mRes, aRes] = await Promise.all([
      fetch("/api/clients?archived=active", { credentials: "include" }),
      fetch("/api/matters?bucket=all", { credentials: "include" }),
      fetch("/api/trust/accounts?active=all", { credentials: "include" }),
    ]);
    if (cRes.ok) {
      const data = await cRes.json();
      setClients(
        (data.items ?? []).map(
          (c: { id: string; displayName?: string; clientNumber?: string }) => ({
            id: c.id,
            label: c.displayName || c.clientNumber || c.id.slice(0, 8),
          }),
        ),
      );
    }
    if (mRes.ok) {
      const data = await mRes.json();
      setMatters(
        (data.items ?? []).map(
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
      setAccounts(
        (data.items ?? [])
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
        setTrustPreview({
          trustBalanceCents: data.trustBalanceCents ?? null,
          shortfallCents: data.shortfallCents ?? null,
          message: data.shortfall?.message ?? data.approvalTier?.reason ?? null,
          allowFirmFloat: data.shortfall?.allowFirmFloat !== false,
          blockIfShort: data.shortfall?.blockIfShort === true,
        });
        const short =
          data.shortfallCents != null && Number(data.shortfallCents) > 0;
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
      setFormOpen(false);
      setDescription("");
      setAmountDollars("");
      await load();
      if (data.requisition?.id) setSelectedId(data.requisition.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed.");
    } finally {
      setSaving(false);
    }
  }

  async function runAction(
    action: string,
    extra: Record<string, unknown> = {},
  ) {
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
      if (data.trustShortfallWarning) {
        setError(data.trustShortfallWarning);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="view active scrollable" aria-label="Requisitions">
      <div className="panel">
        <div className="panel-head" style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <h3 style={{ marginRight: "auto" }}>Requisitions</h3>
          <Link href="/finance/expenses" className="btn btn-ghost btn-sm">
            Expenses
          </Link>
          <Link href="/finance/client-accounts" className="btn btn-ghost btn-sm">
            Client accounts
          </Link>
          <Can permission="finance.requisitions.request">
            <Button type="button" onClick={() => setFormOpen((v) => !v)}>
              {formOpen ? "Close form" : "New requisition"}
            </Button>
          </Can>
        </div>
        <div className="panel-body">
          <p style={{ marginTop: 0 }}>
            Request funds as <strong>Business</strong> (firm operating costs) or{" "}
            <strong>Disbursement</strong> (Client then Matter). Submit for approval, then pay
            from operating, client trust, or firm float (recoverable). Paid business items post to{" "}
            <Link href="/finance/expenses">Expenses</Link>; paid disbursements post on the matter
            Costs tab (and trust ledger when paid from trust).
          </p>

          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}

          {formOpen ? (
            <form
              onSubmit={onCreate}
              style={{
                marginBottom: "1.25rem",
                padding: "1rem",
                border: "1px solid var(--border)",
                borderRadius: 8,
                display: "grid",
                gap: "0.75rem",
              }}
            >
              <label>
                Type
                <select
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
                  Nature / category
                  <input
                    required
                    value={nature}
                    onChange={(e) => setNature(e.target.value)}
                    placeholder="e.g. Electricity, stationery"
                  />
                </label>
              ) : (
                <>
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
                    Matter
                    <select
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
              <label>
                Description
                <input
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
              <label>
                Amount ({currency})
                <input
                  required
                  inputMode="decimal"
                  value={amountDollars}
                  onChange={(e) => setAmountDollars(e.target.value)}
                />
              </label>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Submit for approval"}
              </Button>
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
              Type
              <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                <option value="">All</option>
                <option value="business">Business</option>
                <option value="disbursement">Disbursement</option>
              </select>
            </label>
            <label>
              Status
              <select
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
          </div>

          {loading ? (
            <p className="muted">Loading…</p>
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
                    <th>Amount</th>
                    <th>Client / matter</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr
                      key={row.id}
                      style={
                        selectedId === row.id
                          ? { background: "var(--surface-2, transparent)" }
                          : undefined
                      }
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
                      <td>{centsToDisplay(row.amountCents, row.currency)}</td>
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
            <div
              style={{
                marginTop: "1.25rem",
                padding: "1rem",
                border: "1px solid var(--border)",
                borderRadius: 8,
              }}
            >
              <h4 style={{ marginTop: 0 }}>
                {selected.type === "business" ? "Business" : "Disbursement"} ·{" "}
                {centsToDisplay(selected.amountCents, selected.currency)}
              </h4>
              <p style={{ marginTop: 0 }}>{selected.description}</p>
              <p className="muted">
                Status: {selected.status.replace(/_/g, " ")}
                {selected.requesterName ? ` · Requested by ${selected.requesterName}` : ""}
              </p>
              {selected.rejectionNote ? (
                <p className="error">Rejection note: {selected.rejectionNote}</p>
              ) : null}

              {selected.status === "approved" && selected.type === "disbursement" && trustPreview ? (
                <p>
                  Client trust:{" "}
                  {centsToDisplay(trustPreview.trustBalanceCents ?? 0, selected.currency)}
                  {" · Requested "}
                  {centsToDisplay(selected.amountCents, selected.currency)}
                  {trustPreview.message ? (
                    <span
                      className={
                        trustPreview.shortfallCents && trustPreview.shortfallCents > 0
                          ? "error"
                          : "muted"
                      }
                      style={{ display: "block", marginTop: "0.35rem" }}
                    >
                      {trustPreview.message}
                      {trustPreview.blockIfShort
                        ? " (firm block setting is ON)"
                        : null}
                    </span>
                  ) : null}
                </p>
              ) : null}

              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
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
                    <input
                      placeholder="Rejection note"
                      value={rejectNote}
                      onChange={(e) => setRejectNote(e.target.value)}
                      style={{ minWidth: 160 }}
                    />
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
                      <>
                        <select
                          value={payFrom}
                          onChange={(e) =>
                            setPayFrom(e.target.value as "trust" | "firm_float")
                          }
                        >
                          <option value="trust">Pay from trust</option>
                          <option
                            value="firm_float"
                            disabled={
                              Boolean(
                                trustPreview?.shortfallCents &&
                                  trustPreview.shortfallCents > 0 &&
                                  !trustPreview.allowFirmFloat,
                              )
                            }
                          >
                            Firm float (recoverable)
                          </option>
                        </select>
                        {payFrom === "trust" ? (
                          <select
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
                        ) : null}
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
                      </>
                    )}
                    <input
                      placeholder="Payment reference"
                      value={paymentRef}
                      onChange={(e) => setPaymentRef(e.target.value)}
                    />
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
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
