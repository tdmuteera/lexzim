"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Can } from "@/components/auth/Can";
import { HrAccessCallout } from "@/components/hr/HrAccessCallout";
import { HrPageShell } from "@/components/hr/HrPageShell";
import { HrStatStrip } from "@/components/hr/HrStatStrip";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SortableTh } from "@/components/ui/SortableTh";
import { centsToDisplay } from "@/lib/billing/money";
import { useTableSort } from "@/lib/ui/table-sort";

type PeriodItem = {
  id: string;
  label: string;
  periodStart: string;
  periodEnd: string;
  status: string;
};

type PayrollLine = {
  id: string;
  staffProfileId: string;
  staffName: string;
  employeeNumber: string | null;
  grossCents: number;
  advancesOutstandingCents: number;
  deductionsCents: number;
  netPayableCents: number;
  advanceIds: string[];
  paidAt: string | null;
  notes: string | null;
};

function monthBounds(): { start: string; end: string; label: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const label = now.toLocaleString(undefined, { month: "long", year: "numeric" });
  return { start: fmt(start), end: fmt(end), label };
}

function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function HrPayrollView() {
  const { can } = useAuth();
  const canManage = can("hr.manage");

  const [periods, setPeriods] = useState<PeriodItem[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [lines, setLines] = useState<PayrollLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const bounds = monthBounds();
  const [label, setLabel] = useState(bounds.label);
  const [periodStart, setPeriodStart] = useState(bounds.start);
  const [periodEnd, setPeriodEnd] = useState(bounds.end);

  const loadPeriods = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/hr/payroll/periods", { credentials: "include" });
      const body = (await res.json()) as {
        ok?: boolean;
        data?: { items: PeriodItem[] };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Could not load payroll periods.");
        return;
      }
      setPeriods(body.data.items);
      if (!selectedPeriodId && body.data.items[0]) {
        setSelectedPeriodId(body.data.items[0].id);
      }
    } catch {
      setError("Could not load payroll periods.");
    } finally {
      setLoading(false);
    }
  }, [selectedPeriodId]);

  const loadPeriodDetail = useCallback(async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/hr/payroll/periods/${id}`, { credentials: "include" });
      const body = (await res.json()) as {
        ok?: boolean;
        data?: { lines: PayrollLine[] };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Could not load payroll lines.");
        return;
      }
      setLines(body.data.lines);
    } catch {
      setError("Could not load payroll lines.");
    }
  }, []);

  useEffect(() => {
    void loadPeriods();
  }, [loadPeriods]);

  useEffect(() => {
    if (selectedPeriodId) void loadPeriodDetail(selectedPeriodId);
    else setLines([]);
  }, [selectedPeriodId, loadPeriodDetail]);

  async function onCreatePeriod(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/hr/payroll/periods", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label,
          periodStart: new Date(periodStart).toISOString(),
          periodEnd: new Date(periodEnd).toISOString(),
        }),
      });
      const body = (await res.json()) as {
        ok?: boolean;
        data?: { period: PeriodItem };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Could not create period.");
        return;
      }
      setFormOpen(false);
      setSelectedPeriodId(body.data.period.id);
      await loadPeriods();
    } catch {
      setError("Could not create period.");
    } finally {
      setSaving(false);
    }
  }

  async function onGenerate() {
    if (!selectedPeriodId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/hr/payroll/periods/${selectedPeriodId}/generate`, {
        method: "POST",
        credentials: "include",
      });
      const body = (await res.json()) as {
        ok?: boolean;
        data?: { lines: PayrollLine[]; generated: number };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Could not generate payroll lines.");
        return;
      }
      setLines(body.data.lines);
    } catch {
      setError("Could not generate payroll lines.");
    } finally {
      setSaving(false);
    }
  }

  async function onMarkPaid(lineId: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/hr/payroll/lines/${lineId}/mark-paid`, {
        method: "POST",
        credentials: "include",
      });
      const body = (await res.json()) as { ok?: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not mark line paid.");
        return;
      }
      if (selectedPeriodId) await loadPeriodDetail(selectedPeriodId);
    } catch {
      setError("Could not mark line paid.");
    } finally {
      setSaving(false);
    }
  }

  const selectedPeriod = periods.find((p) => p.id === selectedPeriodId) ?? null;

  const summaryStats = useMemo(() => {
    const paidLines = lines.filter((l) => l.paidAt).length;
    const netTotal = lines.reduce((sum, l) => sum + l.netPayableCents, 0);
    return [
      { label: "Periods", value: loading ? "—" : periods.length, icon: "PR" },
      { label: "Lines", value: loading ? "—" : lines.length, icon: "LN" },
      { label: "Net payable", value: loading ? "—" : centsToDisplay(netTotal), icon: "NET" },
      { label: "Paid lines", value: loading ? "—" : paidLines, icon: "OK" },
    ];
  }, [periods.length, lines, loading]);

  const sortAccessors = useMemo(
    () => ({
      staff: (r: PayrollLine) => r.staffName,
      gross: (r: PayrollLine) => r.grossCents,
      advances: (r: PayrollLine) => r.advancesOutstandingCents,
      deduction: (r: PayrollLine) => r.deductionsCents,
      net: (r: PayrollLine) => r.netPayableCents,
      status: (r: PayrollLine) => (r.paidAt ? "Paid" : "Unpaid"),
    }),
    [],
  );
  const { sortedRows, sortKey, sortDir, toggleSort } = useTableSort(lines, sortAccessors, {
    key: "staff",
    dir: "asc",
  });

  return (
    <HrPageShell
      title="Payroll"
      subtitle="Periods · gross · advance recovery · mark paid (MVP)"
      ariaLabel="Payroll"
      actions={
        <>
          <Can permission="hr.manage">
            <Button size="sm" onClick={() => setFormOpen(true)} disabled={loading}>
              New period
            </Button>
          </Can>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void loadPeriods()}
            disabled={loading}
          >
            Refresh
          </Button>
        </>
      }
      summary={<HrStatStrip stats={summaryStats} />}
    >
      <HrAccessCallout />
      <p className="muted hr-aging-note">
        Payroll MVP applies approved advance balances. Full statutory payroll remains deferred.
        Approval of salary advances is discretionary.
      </p>

      {error ? <p className="form-error" role="alert">{error}</p> : null}

      {formOpen ? (
        <form className="hr-form-panel" onSubmit={onCreatePeriod}>
          <h4>New payroll period</h4>
          <div className="hr-form-grid">
                <label>
                  Label
                  <input
                    className="filter-input"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Period start
                  <input
                    className="filter-input"
                    type="date"
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Period end
                  <input
                    className="filter-input"
                    type="date"
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                    required
                  />
                </label>
              </div>
          <div className="hr-form-actions">
            <Button type="submit" size="sm" disabled={saving || !canManage}>
              {saving ? "Saving…" : "Create"}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      <div className="hr-toolbar">
            <select
              className="filter-select"
              value={selectedPeriodId ?? ""}
              onChange={(e) => setSelectedPeriodId(e.target.value || null)}
              aria-label="Select payroll period"
            >
              <option value="">Select period…</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} ({formatShortDate(p.periodStart)} to {formatShortDate(p.periodEnd)})
                </option>
              ))}
            </select>
            <Can permission="hr.manage">
              {selectedPeriod && selectedPeriod.status === "open" ? (
                <Button size="sm" disabled={saving} onClick={() => void onGenerate()}>
                  Generate / refresh lines
                </Button>
              ) : null}
            </Can>
          </div>

      {loading ? (
        <p className="hr-empty-loading">Loading payroll…</p>
      ) : !selectedPeriodId ? (
        <EmptyState title="No payroll period selected" />
      ) : lines.length === 0 ? (
        <EmptyState title="No payroll lines yet" detail="Generate lines for active staff with a gross salary." />
      ) : (
        <div className="hr-table-wrap">
          <table className="data data-dense hr-data-table">
              <thead>
                <tr>
                  <SortableTh
                    label="Staff"
                    columnKey="staff"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="Gross"
                    columnKey="gross"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="Advances out."
                    columnKey="advances"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="Deduction"
                    columnKey="deduction"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="Net payable"
                    columnKey="net"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="Status"
                    columnKey="status"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <th />
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div className="hr-cell-primary">{row.staffName}</div>
                      {row.employeeNumber ? (
                        <div className="hr-cell-meta">{row.employeeNumber}</div>
                      ) : null}
                    </td>
                    <td>{centsToDisplay(row.grossCents)}</td>
                    <td>{centsToDisplay(row.advancesOutstandingCents)}</td>
                    <td>{centsToDisplay(row.deductionsCents)}</td>
                    <td>{centsToDisplay(row.netPayableCents)}</td>
                    <td>
                      <Badge tone={row.paidAt ? "open" : "pending"}>
                        {row.paidAt ? "paid" : "open"}
                      </Badge>
                    </td>
                    <td>
                      <Can permission="hr.manage">
                        {!row.paidAt ? (
                          <Button
                            size="sm"
                            disabled={saving}
                            onClick={() => void onMarkPaid(row.id)}
                          >
                            Mark paid
                          </Button>
                        ) : null}
                      </Can>
                    </td>
                  </tr>
                ))}
              </tbody>
          </table>
        </div>
      )}
    </HrPageShell>
  );
}
