"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Can } from "@/components/auth/Can";
import { FeeMoneyCallout } from "@/components/billing/FeeMoneyCallout";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ageingBucketLabel, daysPastDue } from "@/lib/billing/aging";
import { centsToDisplay } from "@/lib/billing/money";
import { INVOICING_LIST_PATH, invoiceDetailPath } from "@/lib/billing/paths";
import { INVOICE_STATUSES } from "@/lib/billing/validation";

type InvoiceItem = {
  id: string;
  invoiceNumber: string;
  status: string;
  currency: string;
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  displayOverdue: boolean;
  issueDate: string | null;
  dueDate: string | null;
  matterId: string;
  clientId: string | null;
  matterTitle: string | null;
  matterNumber: string | null;
  clientDisplayName: string | null;
};

type MatterOption = { id: string; title: string; matterNumber: string | null };

function statusTone(status: string, overdue: boolean) {
  if (overdue || status === "overdue") return "danger" as const;
  if (status === "paid") return "open" as const;
  if (status === "void") return "closed" as const;
  if (status === "draft") return "pending" as const;
  return "default" as const;
}

function formatShortDate(value: string | null) {
  if (!value) return "n/a";
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function BillingListView() {
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [matters, setMatters] = useState<MatterOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [matterId, setMatterId] = useState("");
  const [creating, setCreating] = useState(false);
  const [createMatterId, setCreateMatterId] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const inv of items) {
      const key =
        inv.displayOverdue && inv.status === "sent" ? "overdue" : inv.status;
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [items]);

  const overdueBalanceCents = useMemo(
    () =>
      items.reduce(
        (sum, inv) =>
          inv.displayOverdue || inv.status === "overdue"
            ? sum + inv.balanceCents
            : sum,
        0,
      ),
    [items],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (matterId) params.set("matterId", matterId);
      const res = await fetch(`/api/invoices?${params.toString()}`, {
        credentials: "include",
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { items: InvoiceItem[] };
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not load invoices.");
        setItems([]);
        return;
      }
      setItems(body.data?.items ?? []);
    } catch {
      setError("Could not load invoices.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [status, matterId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/matters?bucket=all", { credentials: "include" });
        const body = (await res.json()) as {
          ok?: boolean;
          data?: { items?: MatterOption[] };
        };
        if (!cancelled && res.ok && body.data?.items) {
          setMatters(body.data.items);
          if (!createMatterId && body.data.items[0]) {
            setCreateMatterId(body.data.items[0].id);
          }
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [createMatterId]);

  async function createInvoice() {
    setSaving(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matterId: createMatterId,
          includeTime: true,
          includeDisbursements: true,
        }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { invoice: { id: string } };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setCreateError(body.error?.message ?? "Could not create invoice.");
        return;
      }
      setCreating(false);
      window.location.href = invoiceDetailPath(body.data.invoice.id);
    } catch {
      setCreateError("Could not create invoice.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="view active scrollable finance-desk-view" aria-label="Invoicing">
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Invoicing</h3>
            <p className="panel-subtitle muted">Fee notes · firm revenue · not trust</p>
          </div>
          <Can permission="billing.manage">
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <Link href="/finance/invoicing/new" className="btn btn-primary btn-sm">
                New invoice
              </Link>
              <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
                From unbilled
              </Button>
            </div>
          </Can>
        </div>
        <div className="panel-body">
          <FeeMoneyCallout variant="list" />

          {!loading && items.length > 0 ? (
            <div className="finance-status-summary" aria-label="Invoice status summary">
              {INVOICE_STATUSES.map((s) =>
                statusCounts[s] ? (
                  <button
                    key={s}
                    type="button"
                    className={["finance-status-chip", status === s ? "active" : ""]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => setStatus(status === s ? "" : s)}
                  >
                    <span>{s}</span>
                    <strong>{statusCounts[s]}</strong>
                  </button>
                ) : null,
              )}
              {statusCounts.overdue ? (
                <div className="finance-overdue-hint">
                  Overdue balance:{" "}
                  <strong>
                    {centsToDisplay(
                      overdueBalanceCents,
                      items.find((i) => i.balanceCents > 0)?.currency ?? "USD",
                    )}
                  </strong>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="toolbar">
            <select
              className="filter-select"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              {INVOICE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              className="filter-select"
              value={matterId}
              onChange={(e) => setMatterId(e.target.value)}
              aria-label="Filter by matter"
              style={{ minWidth: "200px" }}
            >
              <option value="">All matters</option>
              {matters.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.matterNumber ? `${m.matterNumber} · ${m.title}` : m.title}
                </option>
              ))}
            </select>
            <span className="toolbar-spacer" />
            <Button size="sm" variant="outline" onClick={() => load()} disabled={loading}>
              Refresh
            </Button>
          </div>

          {error ? (
            <p role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem" }}>
              {error}
            </p>
          ) : null}

          {creating ? (
            <div className="panel finance-create-panel" style={{ padding: "1rem", marginBottom: "1rem" }}>
              <h4 style={{ marginTop: 0 }}>Create fee note from unbilled</h4>
              {createError ? (
                <p role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem" }}>
                  {createError}
                </p>
              ) : null}
              <div className="form-group">
                <label htmlFor="inv-matter">Matter</label>
                <select
                  id="inv-matter"
                  value={createMatterId}
                  onChange={(e) => setCreateMatterId(e.target.value)}
                >
                  {matters.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.matterNumber ? `${m.matterNumber} · ${m.title}` : m.title}
                    </option>
                  ))}
                </select>
              </div>
              <p className="muted" style={{ fontSize: "0.8rem" }}>
                Pulls billable unbilled time (with rates) and disbursements, then locks those
                lines on the draft fee note.
              </p>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <Button
                  size="sm"
                  onClick={() => void createInvoice()}
                  disabled={saving || !createMatterId}
                >
                  {saving ? "Creating…" : "Create draft"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={saving}
                  onClick={() => setCreating(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}

          {loading && !items.length ? (
            <p className="muted" style={{ fontSize: "0.85rem" }}>
              Loading fee notes…
            </p>
          ) : null}

          {!loading && items.length === 0 ? (
            <EmptyState
              title="No fee notes"
              detail="Create one from unbilled time and costs on a matter."
            />
          ) : (
            <div className="table-wrap">
              <table className="data data-dense finance-invoice-table">
                <thead>
                  <tr>
                    <th>Number</th>
                    <th>Client</th>
                    <th>Matter</th>
                    <th>Status</th>
                    <th>Issued</th>
                    <th>Due</th>
                    <th>Ageing</th>
                    <th>Total</th>
                    <th>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((inv) => {
                    const overdue =
                      inv.displayOverdue || inv.status === "overdue";
                    const statusKey =
                      inv.displayOverdue && inv.status === "sent"
                        ? "overdue"
                        : inv.status;
                    const pastDue = overdue ? daysPastDue(inv.dueDate) : null;
                    const bucket =
                      overdue && inv.balanceCents > 0
                        ? ageingBucketLabel(inv.dueDate)
                        : null;

                    return (
                      <tr
                        key={inv.id}
                        className={overdue && inv.balanceCents > 0 ? "row-overdue" : ""}
                      >
                        <td>
                          <Link
                            href={invoiceDetailPath(inv.id)}
                            className="finance-invoice-link"
                          >
                            {inv.invoiceNumber}
                          </Link>
                        </td>
                        <td>
                          {inv.clientId ? (
                            <Link href={`/clients/${inv.clientId}`}>
                              {inv.clientDisplayName ?? "Client"}
                            </Link>
                          ) : (
                            inv.clientDisplayName ?? "Client"
                          )}
                        </td>
                        <td>
                          <Link href={`/matters/${inv.matterId}`}>
                            {inv.matterNumber ?? inv.matterTitle ?? inv.matterId}
                          </Link>
                          {inv.matterNumber && inv.matterTitle ? (
                            <div className="muted finance-cell-sub">
                              {inv.matterTitle}
                            </div>
                          ) : null}
                        </td>
                        <td>
                          <Badge tone={statusTone(inv.status, inv.displayOverdue)}>
                            {statusKey}
                          </Badge>
                        </td>
                        <td>{formatShortDate(inv.issueDate)}</td>
                        <td>{formatShortDate(inv.dueDate)}</td>
                        <td>
                          {pastDue !== null ? (
                            <span className="finance-ageing-hint">
                              {pastDue}d
                              {bucket ? ` · ${bucket}` : ""}
                            </span>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td>{centsToDisplay(inv.totalCents, inv.currency)}</td>
                        <td className={inv.balanceCents > 0 ? "finance-balance-outstanding" : ""}>
                          {centsToDisplay(inv.balanceCents, inv.currency)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
