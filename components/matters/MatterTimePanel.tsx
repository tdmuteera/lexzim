"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Can } from "@/components/auth/Can";
import { useAuth } from "@/components/auth/AuthProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SortableTh } from "@/components/ui/SortableTh";
import { centsToDisplay, formatMinutes } from "@/lib/billing/money";
import { useTableSort } from "@/lib/ui/table-sort";

type TimeEntryItem = {
  id: string;
  userId: string;
  userName: string | null;
  workedAt: string;
  minutes: number;
  billable: boolean;
  rateCents: number | null;
  currency: string | null;
  description: string | null;
  invoiceId: string | null;
  locked: boolean;
  amountCents: number | null;
};

type Totals = {
  entryCount: number;
  billableMinutes: number;
  nonBillableMinutes: number;
  unbilledMinutes: number;
  unbilledAmountCents: number;
  lockedMinutes: number;
  currency: string;
};

type StaffOption = { id: string; fullName: string };

type FormState = {
  userId: string;
  workedAt: string;
  minutes: string;
  billable: boolean;
  rateDollars: string;
  description: string;
};

function toLocalInputValue(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function emptyForm(userId: string): FormState {
  return {
    userId,
    workedAt: toLocalInputValue(),
    minutes: "60",
    billable: true,
    rateDollars: "",
    description: "",
  };
}

type MatterTimePanelProps = {
  matterId: string;
};

export function MatterTimePanel({ matterId }: MatterTimePanelProps) {
  const { user } = useAuth();
  const [items, setItems] = useState<TimeEntryItem[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [defaultCurrency, setDefaultCurrency] = useState("USD");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm(""));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "unbilled" | "locked">("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/matters/${matterId}/time-entries?includeStaff=1`,
        { credentials: "include" },
      );
      const body = (await res.json()) as {
        ok: boolean;
        data?: {
          items: TimeEntryItem[];
          totals: Totals;
          staff?: StaffOption[];
          defaultCurrency?: string;
          currentUserId?: string;
        };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Could not load time entries.");
        setItems([]);
        return;
      }
      setItems(body.data.items);
      setTotals(body.data.totals);
      setDefaultCurrency(body.data.defaultCurrency || "USD");
      if (body.data.staff) setStaff(body.data.staff);
      setForm((f) =>
        f.userId
          ? f
          : emptyForm(body.data!.currentUserId || user?.id || body.data!.staff?.[0]?.id || ""),
      );
    } catch {
      setError("Could not load time entries.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [matterId, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditingId(null);
    setForm(
      emptyForm(user?.id || staff[0]?.id || form.userId),
    );
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(entry: TimeEntryItem) {
    if (entry.locked) return;
    setEditingId(entry.id);
    setForm({
      userId: entry.userId,
      workedAt: toLocalInputValue(entry.workedAt),
      minutes: String(entry.minutes),
      billable: entry.billable,
      rateDollars:
        entry.rateCents != null ? (entry.rateCents / 100).toFixed(2) : "",
      description: entry.description ?? "",
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
        userId: form.userId,
        workedAt: new Date(form.workedAt).toISOString(),
        minutes: Number(form.minutes),
        billable: form.billable,
        rateDollars: form.rateDollars.trim() ? form.rateDollars : undefined,
        currency: defaultCurrency,
        description: form.description || null,
      };
      const url = editingId
        ? `/api/time-entries/${editingId}`
        : `/api/matters/${matterId}/time-entries`;
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
        setFormError(body.error?.message ?? "Could not save time entry.");
        return;
      }
      setShowForm(false);
      setEditingId(null);
      await load();
    } catch {
      setFormError("Could not save time entry.");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: string) {
    if (!window.confirm("Delete this time entry?")) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/time-entries/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const body = (await res.json()) as {
        ok: boolean;
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not delete time entry.");
        return;
      }
      setShowForm(false);
      await load();
    } catch {
      setError("Could not delete time entry.");
    } finally {
      setSaving(false);
    }
  }

  const visible = useMemo(
    () =>
      items.filter((item) => {
        if (filter === "unbilled") return item.billable && !item.locked;
        if (filter === "locked") return item.locked;
        return true;
      }),
    [items, filter],
  );

  const accessors = useMemo(
    () => ({
      when: (r: TimeEntryItem) => r.workedAt,
      earner: (r: TimeEntryItem) => r.userName ?? "",
      time: (r: TimeEntryItem) => r.minutes,
      rate: (r: TimeEntryItem) => r.rateCents ?? 0,
      amount: (r: TimeEntryItem) => r.amountCents ?? 0,
      status: (r: TimeEntryItem) =>
        r.locked ? "On invoice" : r.billable ? "Unbilled" : "Non-billable",
    }),
    [],
  );
  const { sortedRows, sortKey, sortDir, toggleSort } = useTableSort(visible, accessors, {
    key: "when",
    dir: "desc",
  });

  const currency = totals?.currency || defaultCurrency;

  return (
    <div>
      <div className="toolbar" style={{ marginBottom: "0.75rem" }}>
        <select
          className="filter-select"
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
          aria-label="Filter time entries"
        >
          <option value="all">All</option>
          <option value="unbilled">Unbilled</option>
          <option value="locked">On invoice</option>
        </select>
        <span className="toolbar-spacer" />
        <Can permission="billing.manage">
          <Button size="sm" onClick={openCreate}>
            Add time
          </Button>
        </Can>
        <Button size="sm" variant="outline" onClick={() => load()} disabled={loading}>
          Refresh
        </Button>
      </div>

      {totals ? (
        <div
          className="grid-2"
          style={{ marginBottom: "1rem", fontSize: "0.85rem" }}
        >
          <div>
            <strong>Unbilled:</strong> {formatMinutes(totals.unbilledMinutes)} ·{" "}
            {centsToDisplay(totals.unbilledAmountCents, currency)}
          </div>
          <div>
            <strong>Billable total:</strong> {formatMinutes(totals.billableMinutes)}
            {totals.nonBillableMinutes
              ? ` · Non-billable ${formatMinutes(totals.nonBillableMinutes)}`
              : ""}
            {totals.lockedMinutes
              ? ` · On invoice ${formatMinutes(totals.lockedMinutes)}`
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
          <h4 style={{ marginTop: 0 }}>{editingId ? "Edit time" : "Add time"}</h4>
          {formError ? (
            <p role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem" }}>
              {formError}
            </p>
          ) : null}
          <div className="grid-2">
            <div className="form-group">
              <label htmlFor="te-user">Fee earner</label>
              <select
                id="te-user"
                value={form.userId}
                onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))}
                required
              >
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="te-when">Worked at</label>
              <input
                id="te-when"
                type="datetime-local"
                value={form.workedAt}
                onChange={(e) => setForm((f) => ({ ...f, workedAt: e.target.value }))}
                required
              />
            </div>
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label htmlFor="te-mins">Minutes</label>
              <input
                id="te-mins"
                type="number"
                min={1}
                max={1440}
                value={form.minutes}
                onChange={(e) => setForm((f) => ({ ...f, minutes: e.target.value }))}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="te-rate">Hourly rate ({defaultCurrency})</label>
              <input
                id="te-rate"
                type="number"
                min={0}
                step="0.01"
                placeholder="e.g. 150"
                value={form.rateDollars}
                onChange={(e) => setForm((f) => ({ ...f, rateDollars: e.target.value }))}
              />
            </div>
          </div>
          <div className="form-group">
            <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <input
                type="checkbox"
                checked={form.billable}
                onChange={(e) => setForm((f) => ({ ...f, billable: e.target.checked }))}
              />
              Billable
            </label>
          </div>
          <div className="form-group">
            <label htmlFor="te-desc">Description</label>
            <textarea
              id="te-desc"
              rows={2}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
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
          Loading time…
        </p>
      ) : null}

      {!loading && visible.length === 0 ? (
        <EmptyState
          title="No time entries"
          detail="Log billable or non-billable time against this matter."
        />
      ) : (
        <table className="data">
          <thead>
            <tr>
              <SortableTh label="When" columnKey="when" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
              <SortableTh label="Earner" columnKey="earner" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
              <SortableTh label="Time" columnKey="time" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
              <SortableTh label="Rate" columnKey="rate" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
              <SortableTh label="Amount" columnKey="amount" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
              <SortableTh label="Status" columnKey="status" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
              <th />
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((item) => (
              <tr key={item.id}>
                <td>
                  <div>
                    {new Date(item.workedAt).toLocaleString(undefined, {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                  {item.description ? (
                    <div className="muted" style={{ fontSize: "0.75rem" }}>
                      {item.description}
                    </div>
                  ) : null}
                </td>
                <td>{item.userName ?? "Unknown"}</td>
                <td>{formatMinutes(item.minutes)}</td>
                <td>
                  {item.rateCents != null
                    ? centsToDisplay(item.rateCents, item.currency || currency)
                    : "n/a"}
                </td>
                <td>
                  {item.billable
                    ? centsToDisplay(item.amountCents, item.currency || currency)
                    : "Non-billable"}
                </td>
                <td>
                  {item.locked ? (
                    <Badge tone="pending">On invoice</Badge>
                  ) : item.billable ? (
                    <Badge tone="open">Unbilled</Badge>
                  ) : (
                    <Badge tone="closed">Non-billable</Badge>
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
