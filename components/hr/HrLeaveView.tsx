"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { HrAccessCallout } from "@/components/hr/HrAccessCallout";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { LEAVE_REQUEST_STATUSES } from "@/lib/hr/leave";

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

type Tab = "requests" | "away";

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
  const { can } = useAuth();
  const canManage = can("hr.manage");
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
    } catch {
      setError("Could not load leave requests.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, staffFilter, now]);

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

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    if (tab === "requests") void loadRequests();
    else void loadAway();
  }, [tab, loadRequests, loadAway]);

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

  const canSubmit =
    canManage || (selfStaffProfileId !== null && staffProfileId === selfStaffProfileId);

  return (
    <section className="view active scrollable finance-desk-view" aria-label="HR leave">
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Leave</h3>
            <p className="panel-subtitle muted">
              Requests · approvals · who is away
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
            {(canManage || selfStaffProfileId) ? (
              <Button size="sm" onClick={() => setFormOpen(true)} disabled={loading}>
                Request leave
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              onClick={() => (tab === "requests" ? loadRequests() : loadAway())}
              disabled={loading}
            >
              Refresh
            </Button>
          </div>
        </div>
        <div className="panel-body">
          <HrAccessCallout />

          <div className="toolbar" style={{ marginTop: "1rem", marginBottom: "1rem" }}>
            <button
              type="button"
              className={`tab-btn${tab === "requests" ? " active" : ""}`}
              onClick={() => setTab("requests")}
            >
              Requests
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
            <form className="panel" style={{ padding: "1rem", marginBottom: "1rem" }} onSubmit={onSubmit}>
              <h4 style={{ marginBottom: "0.75rem" }}>New leave request</h4>
              <div className="form-grid" style={{ display: "grid", gap: "0.75rem", maxWidth: "640px" }}>
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
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
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
              <div className="toolbar">
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
                <p className="muted finance-aging-note" style={{ marginBottom: "1rem" }}>
                  Annual leave {annualBalance.year}: {annualBalance.takenDays} days taken of{" "}
                  {annualBalance.entitledDays} entitled
                  {annualBalance.remainingDays != null
                    ? ` (${annualBalance.remainingDays} remaining)`
                    : ""}
                </p>
              ) : null}

              {loading ? (
                <p className="muted">Loading requests…</p>
              ) : requests.length === 0 ? (
                <EmptyState title="No leave requests" />
              ) : (
                <table className="data data-dense">
                  <thead>
                    <tr>
                      <th>Staff</th>
                      <th>Type</th>
                      <th>Dates</th>
                      <th>Days</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map((row) => (
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
                        <td style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                          {canManage && row.status === "requested" ? (
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
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          ) : (
            <>
              <div className="toolbar">
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
                <p className="muted">Loading away list…</p>
              ) : awayItems.length === 0 ? (
                <EmptyState title="Nobody away in this period" />
              ) : (
                <table className="data data-dense">
                  <thead>
                    <tr>
                      <th>Staff</th>
                      <th>Type</th>
                      <th>From</th>
                      <th>To</th>
                      <th>Days</th>
                    </tr>
                  </thead>
                  <tbody>
                    {awayItems.map((row) => (
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
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
