"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Can } from "@/components/auth/Can";
import { HrAccessCallout } from "@/components/hr/HrAccessCallout";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

type StaffItem = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  department: string | null;
  startDate: string | null;
  endDate: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  isActive: boolean;
  notes: string | null;
  userId: string | null;
  userEmail: string | null;
  userFullName: string | null;
  annualLeaveEntitlementDays: number | null;
};

type LinkableUser = {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  linkedProfileId: string | null;
};

function formatShortDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function dateInputFromIso(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function HrStaffView() {
  const { can } = useAuth();
  const canManage = can("hr.manage");

  const [items, setItems] = useState<StaffItem[]>([]);
  const [linkableUsers, setLinkableUsers] = useState<LinkableUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeOnly, setActiveOnly] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [notes, setNotes] = useState("");
  const [userId, setUserId] = useState("");
  const [annualEntitlement, setAnnualEntitlement] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (activeOnly) params.set("activeOnly", "1");
      const res = await fetch(`/api/hr/staff?${params.toString()}`, { credentials: "include" });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { items: StaffItem[]; linkableUsers: LinkableUser[] };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Could not load staff records.");
        return;
      }
      setItems(body.data.items);
      setLinkableUsers(body.data.linkableUsers);
    } catch {
      setError("Could not load staff records.");
    } finally {
      setLoading(false);
    }
  }, [activeOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  function resetForm() {
    setEditingId(null);
    setFullName("");
    setEmail("");
    setPhone("");
    setJobTitle("");
    setDepartment("");
    setStartDate("");
    setEndDate("");
    setEmergencyName("");
    setEmergencyPhone("");
    setIsActive(true);
    setNotes("");
    setUserId("");
    setAnnualEntitlement("");
    setFormOpen(false);
  }

  function openCreate() {
    resetForm();
    setFormOpen(true);
  }

  function openEdit(row: StaffItem) {
    setEditingId(row.id);
    setFullName(row.fullName);
    setEmail(row.email ?? "");
    setPhone(row.phone ?? "");
    setJobTitle(row.jobTitle ?? "");
    setDepartment(row.department ?? "");
    setStartDate(dateInputFromIso(row.startDate));
    setEndDate(dateInputFromIso(row.endDate));
    setEmergencyName(row.emergencyContactName ?? "");
    setEmergencyPhone(row.emergencyContactPhone ?? "");
    setIsActive(row.isActive);
    setNotes(row.notes ?? "");
    setUserId(row.userId ?? "");
    setAnnualEntitlement(
      row.annualLeaveEntitlementDays != null ? String(row.annualLeaveEntitlementDays) : "",
    );
    setFormOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        fullName,
        email: email || null,
        phone: phone || null,
        jobTitle: jobTitle || null,
        department: department || null,
        startDate: startDate || null,
        endDate: endDate || null,
        emergencyContactName: emergencyName || null,
        emergencyContactPhone: emergencyPhone || null,
        isActive,
        notes: notes || null,
        userId: userId || null,
        annualLeaveEntitlementDays: annualEntitlement === "" ? null : Number(annualEntitlement),
      };
      const url = editingId ? `/api/hr/staff/${editingId}` : "/api/hr/staff";
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as { ok?: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not save staff record.");
        return;
      }
      resetForm();
      await load();
    } catch {
      setError("Could not save staff record.");
    } finally {
      setSaving(false);
    }
  }

  const availableUsers = linkableUsers.filter(
    (u) => !u.linkedProfileId || u.linkedProfileId === editingId,
  );

  return (
    <section className="view active scrollable finance-desk-view" aria-label="HR staff records">
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Staff records</h3>
            <p className="panel-subtitle muted">
              Employment profiles · optional link to LexZim login
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
            <Can permission="hr.manage">
              <Button size="sm" onClick={() => openCreate()} disabled={loading}>
                Add staff
              </Button>
            </Can>
            <Button size="sm" variant="outline" onClick={() => load()} disabled={loading}>
              Refresh
            </Button>
          </div>
        </div>
        <div className="panel-body">
          <HrAccessCallout />

          <div className="toolbar" style={{ marginTop: "1rem" }}>
            <label className="filter-label">
              <input
                type="checkbox"
                checked={activeOnly}
                onChange={(e) => setActiveOnly(e.target.checked)}
              />
              Active only
            </label>
          </div>

          {error ? <p className="form-error" role="alert">{error}</p> : null}

          {formOpen && canManage ? (
            <form className="panel" style={{ padding: "1rem", marginBottom: "1rem" }} onSubmit={onSubmit}>
              <h4 style={{ marginBottom: "0.75rem" }}>
                {editingId ? "Edit staff record" : "New staff record"}
              </h4>
              <div className="form-grid" style={{ display: "grid", gap: "0.75rem", maxWidth: "640px" }}>
                <label>
                  Full name
                  <input className="filter-input" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                </label>
                <label>
                  Job title
                  <input className="filter-input" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
                </label>
                <label>
                  Department
                  <input className="filter-input" value={department} onChange={(e) => setDepartment(e.target.value)} />
                </label>
                <label>
                  Email
                  <input className="filter-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </label>
                <label>
                  Phone
                  <input className="filter-input" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </label>
                <label>
                  Start date
                  <input className="filter-input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </label>
                <label>
                  End date
                  <input className="filter-input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </label>
                <label>
                  Link to login user
                  <select className="filter-select" value={userId} onChange={(e) => setUserId(e.target.value)}>
                    <option value="">No login (non-system staff)</option>
                    {availableUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName} ({u.email}){u.linkedProfileId && u.linkedProfileId !== editingId ? " · linked" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Annual leave entitlement (days)
                  <input
                    className="filter-input"
                    type="number"
                    min={0}
                    max={365}
                    value={annualEntitlement}
                    onChange={(e) => setAnnualEntitlement(e.target.value)}
                    placeholder="Manual entitlement per year"
                  />
                </label>
                <label>
                  Emergency contact name
                  <input className="filter-input" value={emergencyName} onChange={(e) => setEmergencyName(e.target.value)} />
                </label>
                <label>
                  Emergency contact phone
                  <input className="filter-input" value={emergencyPhone} onChange={(e) => setEmergencyPhone(e.target.value)} />
                </label>
                <label style={{ gridColumn: "1 / -1" }}>
                  Notes
                  <textarea className="filter-input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
                </label>
                <label>
                  <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                  Active
                </label>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
                <Button type="submit" size="sm" disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => resetForm()}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : null}

          {loading ? (
            <p className="muted">Loading staff records…</p>
          ) : items.length === 0 ? (
            <EmptyState title="No staff records yet" />
          ) : (
            <table className="data data-dense">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Title</th>
                  <th>Login</th>
                  <th>Start</th>
                  <th>Status</th>
                  {canManage ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.fullName}</strong>
                      {row.email ? <div className="muted" style={{ fontSize: "0.85rem" }}>{row.email}</div> : null}
                    </td>
                    <td>{row.jobTitle ?? "—"}</td>
                    <td>
                      {row.userId
                        ? row.userFullName ?? row.userEmail ?? "Linked"
                        : <span className="muted">No login</span>}
                    </td>
                    <td>{formatShortDate(row.startDate)}</td>
                    <td>
                      <Badge tone={row.isActive ? "open" : "closed"}>
                        {row.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    {canManage ? (
                      <td>
                        <Button size="sm" variant="outline" onClick={() => openEdit(row)}>
                          Edit
                        </Button>
                      </td>
                    ) : null}
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
