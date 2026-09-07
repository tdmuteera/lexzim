"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Can } from "@/components/auth/Can";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { centsToDisplay } from "@/lib/billing/money";

type DisbursementItem = {
  id: string;
  description: string;
  amountCents: number;
  currency: string;
  incurredAt: string;
  billable: boolean;
  billableToClient: boolean;
  invoiceId: string | null;
  locked: boolean;
};

type Totals = {
  entryCount: number;
  billableAmountCents: number;
  nonBillableAmountCents: number;
  unbilledAmountCents: number;
  lockedAmountCents: number;
  currency: string;
};

type FormState = {
  description: string;
  amountDollars: string;
  incurredAt: string;
  billableToClient: boolean;
};

function toDateInputValue(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function emptyForm(): FormState {
  return {
    description: "",
    amountDollars: "",
    incurredAt: toDateInputValue(),
    billableToClient: true,
  };
}

type MatterDisbursementsPanelProps = {
  matterId: string;
};

export function MatterDisbursementsPanel({ matterId }: MatterDisbursementsPanelProps) {
  const [items, setItems] = useState<DisbursementItem[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [defaultCurrency, setDefaultCurrency] = useState("USD");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "unbilled" | "locked">("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/matters/${matterId}/disbursements`, {
        credentials: "include",
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: {
          items: DisbursementItem[];
          totals: Totals;
          defaultCurrency?: string;
        };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Could not load disbursements.");
        setItems([]);
        return;
      }
      setItems(body.data.items);
      setTotals(body.data.totals);
      setDefaultCurrency(body.data.defaultCurrency || "USD");
    } catch {
      setError("Could not load disbursements.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [matterId]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(item: DisbursementItem) {
    if (item.locked) return;
    setEditingId(item.id);
    setForm({
      description: item.description,
      amountDollars: (item.amountCents / 100).toFixed(2),
      incurredAt: toDateInputValue(item.incurredAt),
      billableToClient: item.billableToClient,
    });
    setFormError(null);
    setShowForm(true);
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        description: form.description,
        amountDollars: form.amountDollars,
        currency: defaultCurrency,
        incurredAt: new Date(`${form.incurredAt}T12:00:00`).toISOString(),
        billableToClient: form.billableToClient,
      };
      const url = editingId
        ? `/api/disbursements/${editingId}`
        : `/api/matters/${matterId}/disbursements`;
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as {
        ok: boolean;
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setFormError(body.error?.message ?? "Could not save disbursement.");
        return;
      }
      setShowForm(false);
      setEditingId(null);
      await load();
    } catch {
      setFormError("Could not save disbursement.");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: string) {
    if (!window.confirm("Delete this disbursement?")) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/disbursements/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const body = (await res.json()) as {
        ok: boolean;
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not delete disbursement.");
        return;
      }
      setShowForm(false);
      await load();
    } catch {
      setError("Could not delete disbursement.");
    } finally {
      setSaving(false);
    }
  }

  const visible = items.filter((item) => {
    if (filter === "unbilled") return item.billable && !item.locked;
    if (filter === "locked") return item.locked;
    return true;
  });

  const currency = totals?.currency || defaultCurrency;

  return (
    <div>
      <div className="toolbar" style={{ marginBottom: "0.75rem" }}>
        <select
          className="filter-select"
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
          aria-label="Filter disbursements"
        >
          <option value="all">All</option>
          <option value="unbilled">Unbilled</option>
          <option value="locked">On invoice</option>
        </select>
        <span className="toolbar-spacer" />
        <Can permission="billing.manage">
          <Button size="sm" onClick={openCreate}>
            Add cost
          </Button>
        </Can>
        <Button size="sm" variant="outline" onClick={() => load()} disabled={loading}>
          Refresh
        </Button>
      </div>

      <p className="muted" style={{ fontSize: "0.78rem", marginTop: 0 }}>
        Disbursements are firm costs / client recoverables on the fee side. They are not trust
        ledger movements.
      </p>

      {totals ? (
        <div className="grid-2" style={{ marginBottom: "1rem", fontSize: "0.85rem" }}>
          <div>
            <strong>Unbilled:</strong>{" "}
            {centsToDisplay(totals.unbilledAmountCents, currency)}
          </div>
          <div>
            <strong>Billable total:</strong>{" "}
            {centsToDisplay(totals.billableAmountCents, currency)}
            {totals.nonBillableAmountCents
              ? ` · Non-billable ${centsToDisplay(totals.nonBillableAmountCents, currency)}`
              : ""}
            {totals.lockedAmountCents
              ? ` · On invoice ${centsToDisplay(totals.lockedAmountCents, currency)}`
              : ""}
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem" }}>
          {error}
        </p>
      ) : null}

      {showForm ? (
        <form
          onSubmit={onSave}
          className="panel"
          style={{ padding: "1rem", marginBottom: "1rem" }}
        >
          <h4 style={{ marginTop: 0 }}>
            {editingId ? "Edit disbursement" : "Add disbursement"}
          </h4>
          {formError ? (
            <p role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem" }}>
              {formError}
            </p>
          ) : null}
          <div className="form-group">
            <label htmlFor="db-desc">Description</label>
            <input
              id="db-desc"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="e.g. Filing fee, courier, search"
              required
            />
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label htmlFor="db-amount">Amount ({defaultCurrency})</label>
              <input
                id="db-amount"
                type="number"
                min={0.01}
                step="0.01"
                value={form.amountDollars}
                onChange={(e) => setForm((f) => ({ ...f, amountDollars: e.target.value }))}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="db-when">Incurred</label>
              <input
                id="db-when"
                type="date"
                value={form.incurredAt}
                onChange={(e) => setForm((f) => ({ ...f, incurredAt: e.target.value }))}
                required
              />
            </div>
          </div>
          <div className="form-group">
            <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <input
                type="checkbox"
                checked={form.billableToClient}
                onChange={(e) =>
                  setForm((f) => ({ ...f, billableToClient: e.target.checked }))
                }
              />
              Billable to client
            </label>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={saving}
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
              }}
            >
              Cancel
            </Button>
            {editingId ? (
              <Button
                type="button"
                size="sm"
                variant="danger"
                disabled={saving}
                onClick={() => onDelete(editingId)}
              >
                Delete
              </Button>
            ) : null}
          </div>
        </form>
      ) : null}

      {loading && !items.length ? (
        <p className="muted" style={{ fontSize: "0.85rem" }}>
          Loading costs…
        </p>
      ) : null}

      {!loading && visible.length === 0 ? (
        <EmptyState
          title="No disbursements"
          detail="Record filing fees, courier, and other recoverable costs here. Paid disbursement requisitions also appear on this matter."
        />
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th>When</th>
              <th>Description</th>
              <th>Amount</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.map((item) => (
              <tr key={item.id}>
                <td>
                  {new Date(item.incurredAt).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </td>
                <td>{item.description}</td>
                <td>{centsToDisplay(item.amountCents, item.currency || currency)}</td>
                <td>
                  {item.locked ? (
                    <Badge tone="pending">On invoice</Badge>
                  ) : item.billable ? (
                    <Badge tone="open">Unbilled</Badge>
                  ) : (
                    <Badge tone="closed">Not to client</Badge>
                  )}
                </td>
                <td>
                  <Can permission="billing.manage">
                    {!item.locked ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={saving}
                        onClick={() => openEdit(item)}
                      >
                        Edit
                      </Button>
                    ) : (
                      <span className="muted" style={{ fontSize: "0.75rem" }}>
                        Locked
                      </span>
                    )}
                  </Can>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
