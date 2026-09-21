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
import { LEAVE_REQUEST_STATUSES } from "@/lib/hr/leave";
import { useTableSort } from "@/lib/ui/table-sort";

type LeaveType = { id: string; code: string; name: string; isPaid: boolean };
type StaffOption = { id: string; fullName: string };
type LeaveItem = {
  id: string;
  staffProfileId: string;
  staffName: string;
  leaveTypeName: string;
  leaveTypeCode: string;
  fromDate: string;
  toDate: string;
  days: number;
  status: string;
  notes: string | null;
  decisionNotes: string | null;
};

type AnnualBalance = {
  year: number;
  entitledDays: number | null;
  takenDays: number;
  remainingDays: number | null;
};

type LedgerRow = {
  leaveTypeId: string;
  leaveTypeCode: string;
  leaveTypeName: string;
  year: number;
  entitlementDays: number;
  usedDays: number;
  pendingDays: number;
  remainingDays: number;
};

type Tab = "requests" | "away" | "ledger";

function todayInput() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function statusTone(status: string) {
  if (status === "approved") return "open" as const;
  if (status === "requested") return "pending" as const;
  if (status === "rejected") return "danger" as const;
  return "closed" as const;
}

function weekRange(): { from: string; to: string } {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  return { from: fmt(monday), to: fmt(sunday) };
}

function monthRange(): { from: string; to: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const fmt = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  return { from: fmt(start), to: fmt(end) };
}

export function HrLeaveView() {
  const { can, canAny } = useAuth();
  const canManage = can("hr.manage");
  const canApproveLeave = canAny(["leave.approve", "hr.manage"]);
  const now = new Date();

  const [tab, setTab] = useState<Tab>("requests");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [requests, setRequests] = useState<LeaveItem[]>([]);
  const [awayItems, setAwayItems] = useState<LeaveItem[]>([]);
  const [selfStaffProfileId, setSelfStaffProfileId] = useState<string | null>(null);
  const [annualBalance, setAnnualBalance] = useState<AnnualBalance | null>(null);

  const [statusFilter, setStatusFilter] = useState("");
  const [staffFilter, setStaffFilter] = useState("");

  const [awayFrom, setAwayFrom] = useState(weekRange().from);
  const [awayTo, setAwayTo] = useState(weekRange().to);

  const [ledgerStaffId, setLedgerStaffId] = useState("");
  const [ledgerYear, setLedgerYear] = useState(String(now.getFullYear()));
  const [ledgerRows, setLedgerRows] = useState<LedgerRow[]>([]);
  const [entitlementEdits, setEntitlementEdits] = useState<Record<string, string>>({});

  const [formOpen, setFormOpen] = useState(false);
  const [staffProfileId, setStaffProfileId] = useState("");
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [fromDate, setFromDate] = useState(todayInput);
  const [toDate, setToDate] = useState(todayInput);
  const [notes, setNotes] = useState("");

  const loadMeta = useCallback(async () => {
    const [typesRes, staffRes] = await Promise.all([
      fetch("/api/hr/leave-types", { credentials: "include" }),
      fetch("/api/hr/staff?activeOnly=1", { credentials: "include" }),
    ]);
    const typesBody = (await typesRes.json()) as { ok?: boolean; data?: { items: LeaveType[] } };
    const staffBody = (await staffRes.json()) as {
      ok?: boolean;
      data?: { items: Array<{ id: string; fullName: string }> };
    };
    if (typesRes.ok && typesBody.ok && typesBody.data) {
      setLeaveTypes(typesBody.data.items.filter((t) => t.id));
    }
    if (staffRes.ok && staffBody.ok && staffBody.data) {
      setStaffOptions(staffBody.data.items.map((s) => ({ id: s.id, fullName: s.fullName })));
    }
  }, []);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (staffFilter) params.set("staffProfileId", staffFilter);
      if (staffFilter) params.set("balanceYear", String(now.getFullYear()));
      const res = await fetch(`/api/hr/leave-requests?${params.toString()}`, {
        credentials: "include",
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: {
          items: LeaveItem[];
          selfStaffProfileId: string | null;
          annualBalance: AnnualBalance | null;
        };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Could not load leave requests.");
        return;
      }
      setRequests(body.data.items);
      setSelfStaffProfileId(body.data.selfStaffProfileId);
      setAnnualBalance(body.data.annualBalance);
      if (!staffProfileId && body.data.selfStaffProfileId) {
        setStaffProfileId(body.data.selfStaffProfileId);
      }
      if (!ledgerStaffId && body.data.selfStaffProfileId) {
        setLedgerStaffId(body.data.selfStaffProfileId);
      }
    } catch {
      setError("Could not load leave requests.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, staffFilter, now, staffProfileId, ledgerStaffId]);

  const loadAway = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        away: "1",
        from: awayFrom,
        to: awayTo,
      });
      const res = await fetch(`/api/hr/leave-requests?${params.toString()}`, {
        credentials: "include",
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { items: LeaveItem[] };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Could not load away list.");
        return;
      }
      setAwayItems(body.data.items);
    } catch {
      setError("Could not load away list.");
    } finally {
      setLoading(false);
    }
  }, [awayFrom, awayTo]);

  const loadLedger = useCallback(async () => {
    if (!ledgerStaffId) {
      setLedgerRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        staffProfileId: ledgerStaffId,
        year: ledgerYear,
      });
      const res = await fetch(`/api/hr/leave-ledger?${params.toString()}`, {
        credentials: "include",
      });
      const body = (await res.json()) as {
        ok?: boolean;
        data?: { items: LedgerRow[] };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Could not load leave ledger.");
        return;
      }
      setLedgerRows(body.data.items);
      const edits: Record<string, string> = {};
      for (const row of body.data.items) {
        edits[row.leaveTypeId] = String(row.entitlementDays);
      }
      setEntitlementEdits(edits);
    } catch {
      setError("Could not load leave ledger.");
    } finally {
      setLoading(false);
    }
  }, [ledgerStaffId, ledgerYear]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    if (tab === "requests") void loadRequests();
    else if (tab === "away") void loadAway();
    else void loadLedger();
  }, [tab, loadRequests, loadAway, loadLedger]);

  useEffect(() => {
    if (leaveTypes.length && !leaveTypeId) {
      setLeaveTypeId(leaveTypes[0].id);
    }
  }, [leaveTypes, leaveTypeId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/hr/leave-requests", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffProfileId,
          leaveTypeId,
          fromDate,
          toDate,
          notes: notes || null,
        }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not submit leave request.");
        return;
      }
      setFormOpen(false);
      setNotes("");
      await loadRequests();
    } catch {
      setError("Could not submit leave request.");
    } finally {
      setSaving(false);
    }
  }

  async function onDecision(id: string, status: "approved" | "rejected", decisionNotes?: string) {
    setError(null);
    try {
      const res = await fetch(`/api/hr/leave-requests/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, decisionNotes: decisionNotes ?? null }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not update leave request.");
        return;
      }
      await loadRequests();
    } catch {
      setError("Could not update leave request.");
    }
  }

  async function onCancel(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/hr/leave-requests/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not cancel leave request.");
        return;
      }
      await loadRequests();
    } catch {
      setError("Could not cancel leave request.");
    }
  }

  async function onSaveEntitlement(leaveTypeIdToSave: string) {
    setSaving(true);
    setError(null);
    try {
      const entitlementDays = Number(entitlementEdits[leaveTypeIdToSave]);
      if (!Number.isInteger(entitlementDays) || entitlementDays < 0) {
        setError("Entitlement must be a whole number of days.");
        return;
      }
      const res = await fetch("/api/hr/leave-ledger", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffProfileId: ledgerStaffId,
          leaveTypeId: leaveTypeIdToSave,
          year: Number(ledgerYear),
          entitlementDays,
        }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not save entitlement.");
        return;
      }
      await loadLedger();
    } catch {
      setError("Could not save entitlement.");
    } finally {
      setSaving(false);
    }
  }

  const canSubmit =
    canManage || (selfStaffProfileId !== null && staffProfileId === selfStaffProfileId);

  const summaryStats = useMemo(() => {
    if (tab === "away") {
      return [
        { label: "Away this period", value: loading ? "—" : awayItems.length, icon: "AW" },
        {
          label: "Period",
          value: `${awayFrom} to ${awayTo}`,
          hint: "Selected date range",
          icon: "DT",
        },
      ];
    }
    if (tab === "ledger") {
      const totalRemaining = ledgerRows.reduce((sum, r) => sum + r.remainingDays, 0);
      return [
        { label: "Leave types", value: loading ? "—" : ledgerRows.length, icon: "TY" },
        { label: "Year", value: ledgerYear, icon: "YR" },
        {
          label: "Total remaining",
          value: loading ? "—" : totalRemaining,
          hint: "Days across types",
          icon: "RM",
        },
      ];
    }
    const pending = requests.filter((r) => r.status === "requested").length;
    const approved = requests.filter((r) => r.status === "approved").length;
    return [
      { label: "Requests", value: loading ? "—" : requests.length, icon: "RQ" },
      { label: "Pending", value: loading ? "—" : pending, icon: "PD" },
      { label: "Approved", value: loading ? "—" : approved, icon: "OK" },
      {
        label: "Annual remaining",
        value:
          annualBalance?.remainingDays != null ? annualBalance.remainingDays : "—",
        hint: annualBalance?.entitledDays != null ? `${annualBalance.year} entitlement` : undefined,
        icon: "AL",
      },
    ];
  }, [
    tab,
    loading,
    awayItems.length,
    awayFrom,
    awayTo,
    ledgerRows,
    ledgerYear,
    requests,
    annualBalance,
  ]);

  const requestAccessors = useMemo(
    () => ({
      staff: (r: LeaveItem) => r.staffName,
      type: (r: LeaveItem) => r.leaveTypeName,
      dates: (r: LeaveItem) => r.fromDate,
      days: (r: LeaveItem) => r.days,
      status: (r: LeaveItem) => r.status,
    }),
    [],
  );
  const {
    sortedRows: sortedRequests,
    sortKey: reqKey,
    sortDir: reqDir,
    toggleSort: toggleReq,
  } = useTableSort(requests, requestAccessors, { key: "dates", dir: "desc" });

  const ledgerAccessors = useMemo(
    () => ({
      type: (r: LedgerRow) => r.leaveTypeName,
      entitlement: (r: LedgerRow) => r.entitlementDays,
      used: (r: LedgerRow) => r.usedDays,
      pending: (r: LedgerRow) => r.pendingDays,
      remaining: (r: LedgerRow) => r.remainingDays,
    }),
    [],
  );
  const {
    sortedRows: sortedLedger,
    sortKey: ledgerKey,
    sortDir: ledgerDir,
    toggleSort: toggleLedger,
  } = useTableSort(ledgerRows, ledgerAccessors, { key: "type", dir: "asc" });

  const awayAccessors = useMemo(
    () => ({
      staff: (r: LeaveItem) => r.staffName,
      type: (r: LeaveItem) => r.leaveTypeName,
      from: (r: LeaveItem) => r.fromDate,
      to: (r: LeaveItem) => r.toDate,
      days: (r: LeaveItem) => r.days,
    }),
    [],
  );
  const {
    sortedRows: sortedAway,
    sortKey: awayKey,
    sortDir: awayDir,
    toggleSort: toggleAway,
  } = useTableSort(awayItems, awayAccessors, { key: "from", dir: "asc" });

  return (
    <HrPageShell
      title="Leave"
      subtitle="Requests · ledger · who is away"
      ariaLabel="HR leave"
      actions={
        <>
          {(canManage || selfStaffProfileId) ? (
            <Button size="sm" onClick={() => setFormOpen(true)} disabled={loading}>
              Request leave
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (tab === "requests") void loadRequests();
              else if (tab === "away") void loadAway();
              else void loadLedger();
            }}
            disabled={loading}
          >
            Refresh
          </Button>
        </>
      }
      summary={<HrStatStrip stats={summaryStats} />}
    >
      <HrAccessCallout />
      <p className="muted hr-aging-note">Leave approval is discretionary.</p>

      <div className="hr-subtabs">
            <button
              type="button"
              className={`tab-btn${tab === "requests" ? " active" : ""}`}
              onClick={() => setTab("requests")}
            >
              Requests
            </button>
            <button
              type="button"
              className={`tab-btn${tab === "ledger" ? " active" : ""}`}
              onClick={() => setTab("ledger")}
            >
              Ledger
            </button>
            <button
              type="button"
              className={`tab-btn${tab === "away" ? " active" : ""}`}
              onClick={() => setTab("away")}
            >
              Who is away
            </button>
          </div>

          {error ? <p className="form-error" role="alert">{error}</p> : null}

      {formOpen ? (
        <form className="hr-form-panel" onSubmit={onSubmit}>
          <h4>New leave request</h4>
          <div className="hr-form-grid">
                {canManage ? (
                  <label>
                    Staff
                    <select
                      className="filter-select"
                      value={staffProfileId}
                      onChange={(e) => setStaffProfileId(e.target.value)}
                      required
                    >
                      <option value="">Select…</option>
                      {staffOptions.map((s) => (
                        <option key={s.id} value={s.id}>{s.fullName}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label>
                  Leave type
                  <select
                    className="filter-select"
                    value={leaveTypeId}
                    onChange={(e) => setLeaveTypeId(e.target.value)}
                    required
                  >
                    {leaveTypes.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  From
                  <input className="filter-input" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} required />
                </label>
                <label>
                  To
                  <input className="filter-input" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} required />
                </label>
                <label style={{ gridColumn: "1 / -1" }}>
                  Note
                  <textarea className="filter-input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
                </label>
              </div>
          <div className="hr-form-actions">
            <Button type="submit" size="sm" disabled={saving || !canSubmit}>
              {saving ? "Submitting…" : "Submit"}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {tab === "requests" ? (
        <>
          <div className="hr-toolbar">
                <select
                  className="filter-select"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  aria-label="Filter by status"
                >
                  <option value="">All statuses</option>
                  {LEAVE_REQUEST_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <select
                  className="filter-select"
                  value={staffFilter}
                  onChange={(e) => setStaffFilter(e.target.value)}
                  aria-label="Filter by staff"
                >
                  <option value="">All staff</option>
                  {staffOptions.map((s) => (
                    <option key={s.id} value={s.id}>{s.fullName}</option>
                  ))}
                </select>
              </div>

              {annualBalance && annualBalance.entitledDays != null ? (
                <p className="muted hr-aging-note">
                  Annual leave {annualBalance.year}: {annualBalance.takenDays} days taken of{" "}
                  {annualBalance.entitledDays} entitled
                  {annualBalance.remainingDays != null
                    ? ` (${annualBalance.remainingDays} remaining)`
                    : ""}
                </p>
              ) : null}

              {loading ? (
                <p className="hr-empty-loading">Loading requests…</p>
              ) : requests.length === 0 ? (
                <EmptyState title="No leave requests" />
              ) : (
                <div className="hr-table-wrap">
                  <table className="data data-dense hr-data-table">
                  <thead>
                    <tr>
                      <SortableTh
                        label="Staff"
                        columnKey="staff"
                        activeKey={reqKey}
                        direction={reqDir}
                        onSort={toggleReq}
                      />
                      <SortableTh
                        label="Type"
                        columnKey="type"
                        activeKey={reqKey}
                        direction={reqDir}
                        onSort={toggleReq}
                      />
                      <SortableTh
                        label="Dates"
                        columnKey="dates"
                        activeKey={reqKey}
                        direction={reqDir}
                        onSort={toggleReq}
                      />
                      <SortableTh
                        label="Days"
                        columnKey="days"
                        activeKey={reqKey}
                        direction={reqDir}
                        onSort={toggleReq}
                      />
                      <SortableTh
                        label="Status"
                        columnKey="status"
                        activeKey={reqKey}
                        direction={reqDir}
                        onSort={toggleReq}
                      />
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRequests.map((row) => (
                      <tr key={row.id}>
                        <td>{row.staffName}</td>
                        <td>{row.leaveTypeName}</td>
                        <td>
                          {formatShortDate(row.fromDate)} to {formatShortDate(row.toDate)}
                        </td>
                        <td>{row.days}</td>
                        <td>
                          <Badge tone={statusTone(row.status)}>{row.status}</Badge>
                        </td>
                        <td>
                          <div className="hr-panel-actions">
                            {canApproveLeave && row.status === "requested" ? (
                              <>
                                <Button size="sm" onClick={() => onDecision(row.id, "approved")}>
                                  Approve
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => onDecision(row.id, "rejected")}>
                                  Reject
                                </Button>
                              </>
                            ) : null}
                            {(canManage || selfStaffProfileId === row.staffProfileId) &&
                            row.status !== "cancelled" &&
                            row.status !== "rejected" ? (
                              <Button size="sm" variant="outline" onClick={() => onCancel(row.id)}>
                                Cancel
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  </table>
                </div>
              )}
            </>
          ) : tab === "ledger" ? (
            <>
              <div className="hr-toolbar">
                <select
                  className="filter-select"
                  value={ledgerStaffId}
                  onChange={(e) => setLedgerStaffId(e.target.value)}
                  aria-label="Ledger staff"
                >
                  <option value="">Select staff…</option>
                  {staffOptions.map((s) => (
                    <option key={s.id} value={s.id}>{s.fullName}</option>
                  ))}
                </select>
                <input
                  className="filter-input"
                  type="number"
                  min={2000}
                  max={2100}
                  value={ledgerYear}
                  onChange={(e) => setLedgerYear(e.target.value)}
                  aria-label="Ledger year"
                  style={{ width: "6rem" }}
                />
              </div>

              {loading ? (
                <p className="hr-empty-loading">Loading ledger…</p>
              ) : !ledgerStaffId ? (
                <EmptyState title="Select a staff member" />
              ) : ledgerRows.length === 0 ? (
                <EmptyState title="No leave types" />
              ) : (
                <div className="hr-table-wrap">
                  <table className="data data-dense hr-data-table">
                  <thead>
                    <tr>
                      <SortableTh
                        label="Type"
                        columnKey="type"
                        activeKey={ledgerKey}
                        direction={ledgerDir}
                        onSort={toggleLedger}
                      />
                      <SortableTh
                        label="Entitlement"
                        columnKey="entitlement"
                        activeKey={ledgerKey}
                        direction={ledgerDir}
                        onSort={toggleLedger}
                      />
                      <SortableTh
                        label="Used"
                        columnKey="used"
                        activeKey={ledgerKey}
                        direction={ledgerDir}
                        onSort={toggleLedger}
                      />
                      <SortableTh
                        label="Pending"
                        columnKey="pending"
                        activeKey={ledgerKey}
                        direction={ledgerDir}
                        onSort={toggleLedger}
                      />
                      <SortableTh
                        label="Remaining"
                        columnKey="remaining"
                        activeKey={ledgerKey}
                        direction={ledgerDir}
                        onSort={toggleLedger}
                      />
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedLedger.map((row) => (
                      <tr key={row.leaveTypeId}>
                        <td>{row.leaveTypeName}</td>
                        <td>
                          <Can
                            permission="hr.manage"
                            fallback={<span>{row.entitlementDays}</span>}
                          >
                            <input
                              className="filter-input"
                              type="number"
                              min={0}
                              max={365}
                              style={{ width: "5rem" }}
                              value={entitlementEdits[row.leaveTypeId] ?? String(row.entitlementDays)}
                              onChange={(e) =>
                                setEntitlementEdits((prev) => ({
                                  ...prev,
                                  [row.leaveTypeId]: e.target.value,
                                }))
                              }
                            />
                          </Can>
                        </td>
                        <td>{row.usedDays}</td>
                        <td>{row.pendingDays}</td>
                        <td>{row.remainingDays}</td>
                        <td>
                          <Can permission="hr.manage">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={saving}
                              onClick={() => void onSaveEntitlement(row.leaveTypeId)}
                            >
                              Save
                            </Button>
                          </Can>
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
              <div className="hr-toolbar">
                <Button size="sm" variant="outline" onClick={() => {
                  const w = weekRange();
                  setAwayFrom(w.from);
                  setAwayTo(w.to);
                }}>
                  This week
                </Button>
                <Button size="sm" variant="outline" onClick={() => {
                  const m = monthRange();
                  setAwayFrom(m.from);
                  setAwayTo(m.to);
                }}>
                  This month
                </Button>
                <label className="filter-label">
                  From
                  <input type="date" className="filter-input" value={awayFrom} onChange={(e) => setAwayFrom(e.target.value)} />
                </label>
                <label className="filter-label">
                  To
                  <input type="date" className="filter-input" value={awayTo} onChange={(e) => setAwayTo(e.target.value)} />
                </label>
              </div>

              {loading ? (
                <p className="hr-empty-loading">Loading away list…</p>
              ) : awayItems.length === 0 ? (
                <EmptyState title="Nobody away in this period" />
              ) : (
                <div className="hr-table-wrap">
                  <table className="data data-dense hr-data-table">
                  <thead>
                    <tr>
                      <SortableTh
                        label="Staff"
                        columnKey="staff"
                        activeKey={awayKey}
                        direction={awayDir}
                        onSort={toggleAway}
                      />
                      <SortableTh
                        label="Type"
                        columnKey="type"
                        activeKey={awayKey}
                        direction={awayDir}
                        onSort={toggleAway}
                      />
                      <SortableTh
                        label="From"
                        columnKey="from"
                        activeKey={awayKey}
                        direction={awayDir}
                        onSort={toggleAway}
                      />
                      <SortableTh
                        label="To"
                        columnKey="to"
                        activeKey={awayKey}
                        direction={awayDir}
                        onSort={toggleAway}
                      />
                      <SortableTh
                        label="Days"
                        columnKey="days"
                        activeKey={awayKey}
                        direction={awayDir}
                        onSort={toggleAway}
                      />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedAway.map((row) => (
                      <tr key={row.id}>
                        <td>{row.staffName}</td>
                        <td>{row.leaveTypeName}</td>
                        <td>{formatShortDate(row.fromDate)}</td>
                        <td>{formatShortDate(row.toDate)}</td>
                        <td>{row.days}</td>
                      </tr>
                    ))}
                  </tbody>
                  </table>
                </div>
              )}
            </>
          )}
    </HrPageShell>
  );
}
