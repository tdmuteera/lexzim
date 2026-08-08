"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Can } from "@/components/auth/Can";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { centsToDisplay } from "@/lib/billing/money";
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
      window.location.href = `/billing/invoices/${body.data.invoice.id}`;
    } catch {
      setCreateError("Could not create invoice.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="view active scrollable" aria-label="Billing">
      <div className="panel">
        <div className="panel-head">
          <h3>Fee notes</h3>
          <Can permission="billing.manage">
            <Button size="sm" onClick={() => setCreating(true)}>
              New from unbilled
            </Button>
          </Can>
        </div>
        <div className="panel-body">
          <p className="muted" style={{ marginTop: 0, fontSize: "0.8rem" }}>
            Fee invoices from unbilled time and disbursements. Fee payments are not trust
            receipts. Use the Trust module for client money held in trust.
          </p>

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
              style={{ minWidth: "180px" }}
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
            <div className="panel" style={{ padding: "1rem", marginBottom: "1rem" }}>
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
                Pulls all billable unbilled time (with rates) and disbursements, then locks those
                lines on the draft invoice.
              </p>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <Button size="sm" onClick={() => void createInvoice()} disabled={saving || !createMatterId}>
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
              Loading…
            </p>
          ) : null}

          {!loading && items.length === 0 ? (
            <EmptyState
              title="No fee notes"
              detail="Create one from unbilled time and costs on a matter."
            />
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Client / matter</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th>Balance</th>
                  <th>Due</th>
                </tr>
              </thead>
              <tbody>
                {items.map((inv) => (
                  <tr key={inv.id}>
                    <td>
                      <Link href={`/billing/invoices/${inv.id}`}>{inv.invoiceNumber}</Link>
                    </td>
                    <td>
                      <div>{inv.clientDisplayName ?? "Client"}</div>
                      <div className="muted" style={{ fontSize: "0.75rem" }}>
                        {inv.matterNumber
                          ? `${inv.matterNumber} · ${inv.matterTitle ?? ""}`
                          : inv.matterTitle}
                      </div>
                    </td>
                    <td>
                      <Badge tone={statusTone(inv.status, inv.displayOverdue)}>
                        {inv.displayOverdue && inv.status === "sent"
                          ? "overdue"
                          : inv.status}
                      </Badge>
                    </td>
                    <td>{centsToDisplay(inv.totalCents, inv.currency)}</td>
                    <td>{centsToDisplay(inv.balanceCents, inv.currency)}</td>
                    <td>
                      {inv.dueDate
                        ? new Date(inv.dueDate).toLocaleDateString()
                        : "n/a"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}
