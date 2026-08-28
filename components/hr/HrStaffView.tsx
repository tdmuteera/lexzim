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
import { HR_JOB_CATEGORIES } from "@/lib/hr/job-categories";
import { dollarsToCents } from "@/lib/billing/money";

type StaffItem = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  jobCategory: string | null;
  department: string | null;
  employeeNumber: string | null;
  idPassport: string | null;
  workLocation: string | null;
  startDate: string | null;
  endDate: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  nokFullName: string | null;
  nokRelationship: string | null;
  nokPhone1: string | null;
  nokPhone2: string | null;
  nokAddress: string | null;
  nokEmail: string | null;
  nokOccupation: string | null;
  nokDeclaredAt: string | null;
  nokReceivedAt: string | null;
  grossSalaryCents: number | null;
  netSalaryCents: number | null;
  isActive: boolean;
  notes: string | null;
  userId: string | null;
  userEmail: string | null;
  userFullName: string | null;
  userIsLawyer?: boolean | null;
  userIsSystemUser?: boolean | null;
  annualLeaveEntitlementDays: number | null;
};

type LinkableUser = {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  isLawyer?: boolean;
  isSystemUser?: boolean;
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

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
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
  const [jobCategory, setJobCategory] = useState("");
  const [department, setDepartment] = useState("");
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [idPassport, setIdPassport] = useState("");
  const [workLocation, setWorkLocation] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [nokFullName, setNokFullName] = useState("");
  const [nokRelationship, setNokRelationship] = useState("");
  const [nokPhone1, setNokPhone1] = useState("");
  const [nokPhone2, setNokPhone2] = useState("");
  const [nokAddress, setNokAddress] = useState("");
  const [nokEmail, setNokEmail] = useState("");
  const [nokOccupation, setNokOccupation] = useState("");
  const [nokDeclaredAt, setNokDeclaredAt] = useState("");
  const [nokReceivedAt, setNokReceivedAt] = useState("");
  const [grossSalaryDollars, setGrossSalaryDollars] = useState("");
  const [netSalaryDollars, setNetSalaryDollars] = useState("");
  const [markAsLawyer, setMarkAsLawyer] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [notes, setNotes] = useState("");
  const [userId, setUserId] = useState("");
  const [annualEntitlement, setAnnualEntitlement] = useState("");
  const [listAsLawyer, setListAsLawyer] = useState(false);

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
    setJobCategory("");
    setDepartment("");
    setEmployeeNumber("");
    setIdPassport("");
    setWorkLocation("");
    setStartDate("");
    setEndDate("");
    setNokFullName("");
    setNokRelationship("");
    setNokPhone1("");
    setNokPhone2("");
    setNokAddress("");
    setNokEmail("");
    setNokOccupation("");
    setNokDeclaredAt("");
    setNokReceivedAt("");
    setGrossSalaryDollars("");
    setNetSalaryDollars("");
    setMarkAsLawyer(false);
    setIsActive(true);
    setNotes("");
    setUserId("");
    setAnnualEntitlement("");
    setListAsLawyer(false);
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
    setJobCategory(row.jobCategory ?? "");
    setDepartment(row.department ?? "");
    setEmployeeNumber(row.employeeNumber ?? "");
    setIdPassport(row.idPassport ?? "");
    setWorkLocation(row.workLocation ?? "");
    setStartDate(dateInputFromIso(row.startDate));
    setEndDate(dateInputFromIso(row.endDate));
    setNokFullName(row.nokFullName ?? row.emergencyContactName ?? "");
    setNokRelationship(row.nokRelationship ?? "");
    setNokPhone1(row.nokPhone1 ?? row.emergencyContactPhone ?? "");
    setNokPhone2(row.nokPhone2 ?? "");
    setNokAddress(row.nokAddress ?? "");
    setNokEmail(row.nokEmail ?? "");
    setNokOccupation(row.nokOccupation ?? "");
    setNokDeclaredAt(dateInputFromIso(row.nokDeclaredAt));
    setNokReceivedAt(dateInputFromIso(row.nokReceivedAt));
    setGrossSalaryDollars(
      row.grossSalaryCents != null ? (row.grossSalaryCents / 100).toFixed(2) : "",
    );
    setNetSalaryDollars(
      row.netSalaryCents != null ? (row.netSalaryCents / 100).toFixed(2) : "",
    );
    setMarkAsLawyer(Boolean(row.userIsLawyer));
    setIsActive(row.isActive);
    setNotes(row.notes ?? "");
    setUserId(row.userId ?? "");
    setAnnualEntitlement(
      row.annualLeaveEntitlementDays != null ? String(row.annualLeaveEntitlementDays) : "",
    );
    setListAsLawyer(Boolean(row.userIsLawyer && row.userIsSystemUser === false));
    setFormOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    setSaving(true);
    setError(null);
    try {
      const grossCents = grossSalaryDollars.trim()
        ? dollarsToCents(grossSalaryDollars)
        : null;
      const netCents = netSalaryDollars.trim() ? dollarsToCents(netSalaryDollars) : null;
      const payload = {
        fullName,
        email: email || null,
        phone: phone || null,
        jobTitle: jobTitle || null,
        jobCategory: jobCategory || null,
        department: department || null,
        employeeNumber: employeeNumber || null,
        idPassport: idPassport || null,
        workLocation: workLocation || null,
        startDate: startDate || null,
        endDate: endDate || null,
        nokFullName: nokFullName || null,
        nokRelationship: nokRelationship || null,
        nokPhone1: nokPhone1 || null,
        nokPhone2: nokPhone2 || null,
        nokAddress: nokAddress || null,
        nokEmail: nokEmail || null,
        nokOccupation: nokOccupation || null,
        nokDeclaredAt: nokDeclaredAt || null,
        nokReceivedAt: nokReceivedAt || null,
        grossSalaryCents: grossCents,
        netSalaryCents: netCents,
        isActive,
        notes: notes || null,
        userId: userId || null,
        annualLeaveEntitlementDays: annualEntitlement === "" ? null : Number(annualEntitlement),
        listAsLawyer: !userId && listAsLawyer,
        markAsLawyer: userId ? markAsLawyer : null,
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

  const summaryStats = useMemo(() => {
    const active = items.filter((i) => i.isActive).length;
    const linked = items.filter((i) => i.userId).length;
    return [
      { label: "Total staff", value: loading ? "—" : items.length, icon: "ST" },
      { label: "Active", value: loading ? "—" : active, icon: "OK" },
      { label: "Login linked", value: loading ? "—" : linked, icon: "IN" },
      {
        label: "Inactive",
        value: loading ? "—" : items.length - active,
        icon: "OFF",
      },
    ];
  }, [items, loading]);

  return (
    <HrPageShell
      title="Staff records"
      subtitle="Employees · next of kin · job category · optional LexZim login link"
      ariaLabel="HR staff records"
      actions={
        <>
          <Can permission="hr.manage">
            <Button size="sm" onClick={() => openCreate()} disabled={loading}>
              Add staff
            </Button>
          </Can>
          <Button size="sm" variant="outline" onClick={() => load()} disabled={loading}>
            Refresh
          </Button>
        </>
      }
      summary={<HrStatStrip stats={summaryStats} />}
    >
      <HrAccessCallout />

      <div className="hr-toolbar">
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
        <form className="hr-form-panel" onSubmit={onSubmit}>
          <h4>{editingId ? "Edit staff record" : "New staff record"}</h4>
          <div className="hr-form-grid">
                <label>
                  Full name
                  <input className="filter-input" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                </label>
                <label>
                  Job category
                  <select
                    className="filter-select"
                    value={jobCategory}
                    onChange={(e) => setJobCategory(e.target.value)}
                  >
                    <option value="">Not set</option>
                    {HR_JOB_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c === "custom" ? "Custom title" : c}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Job title (custom / free text)
                  <input className="filter-input" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
                </label>
                <label>
                  Department
                  <input className="filter-input" value={department} onChange={(e) => setDepartment(e.target.value)} />
                </label>
                <label>
                  Employee number
                  <input className="filter-input" value={employeeNumber} onChange={(e) => setEmployeeNumber(e.target.value)} />
                </label>
                <label>
                  ID / passport
                  <input className="filter-input" value={idPassport} onChange={(e) => setIdPassport(e.target.value)} />
                </label>
                <label>
                  Work location
                  <input className="filter-input" value={workLocation} onChange={(e) => setWorkLocation(e.target.value)} />
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
                  Gross salary (USD)
                  <input
                    className="filter-input"
                    type="number"
                    min={0}
                    step="0.01"
                    value={grossSalaryDollars}
                    onChange={(e) => setGrossSalaryDollars(e.target.value)}
                  />
                </label>
                <label>
                  Net salary (USD)
                  <input
                    className="filter-input"
                    type="number"
                    min={0}
                    step="0.01"
                    value={netSalaryDollars}
                    onChange={(e) => setNetSalaryDollars(e.target.value)}
                  />
                </label>
                <label>
                  Link to login user
                  <select className="filter-select" value={userId} onChange={(e) => {
                    setUserId(e.target.value);
                    if (e.target.value) setListAsLawyer(false);
                  }}>
                    <option value="">No login linked yet</option>
                    {availableUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName} ({u.email})
                        {u.isSystemUser === false ? " · no login" : ""}
                        {u.linkedProfileId && u.linkedProfileId !== editingId ? " · linked" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                {!userId ? (
                  <label className="hr-checkbox-row">
                    <input
                      type="checkbox"
                      checked={listAsLawyer}
                      onChange={(e) => setListAsLawyer(e.target.checked)}
                    />
                    <span>
                      This person is a lawyer. Add them to responsible attorney lists even without a
                      LexZim login (for matters they handle and revenue attribution).
                    </span>
                  </label>
                ) : (
                  <label className="hr-checkbox-row">
                    <input
                      type="checkbox"
                      checked={markAsLawyer}
                      onChange={(e) => setMarkAsLawyer(e.target.checked)}
                    />
                    <span>
                      Lawyer eligible (appears in matter/client attorney pickers). Lawyer job
                      categories default this on.
                    </span>
                  </label>
                )}
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

                <h4 className="hr-form-section-title">Next of kin</h4>
                <label>
                  Full name
                  <input className="filter-input" value={nokFullName} onChange={(e) => setNokFullName(e.target.value)} />
                </label>
                <label>
                  Relationship
                  <input className="filter-input" value={nokRelationship} onChange={(e) => setNokRelationship(e.target.value)} />
                </label>
                <label>
                  Phone 1
                  <input className="filter-input" value={nokPhone1} onChange={(e) => setNokPhone1(e.target.value)} />
                </label>
                <label>
                  Phone 2
                  <input className="filter-input" value={nokPhone2} onChange={(e) => setNokPhone2(e.target.value)} />
                </label>
                <label style={{ gridColumn: "1 / -1" }}>
                  Residential address
                  <textarea className="filter-input" rows={2} value={nokAddress} onChange={(e) => setNokAddress(e.target.value)} />
                </label>
                <label>
                  Email
                  <input className="filter-input" type="email" value={nokEmail} onChange={(e) => setNokEmail(e.target.value)} />
                </label>
                <label>
                  Occupation
                  <input className="filter-input" value={nokOccupation} onChange={(e) => setNokOccupation(e.target.value)} />
                </label>
                <label>
                  Declared on
                  <input className="filter-input" type="date" value={nokDeclaredAt} onChange={(e) => setNokDeclaredAt(e.target.value)} />
                </label>
                <label>
                  Received (office)
                  <input className="filter-input" type="date" value={nokReceivedAt} onChange={(e) => setNokReceivedAt(e.target.value)} />
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
          <div className="hr-form-actions">
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
        <p className="hr-empty-loading">Loading staff records…</p>
      ) : items.length === 0 ? (
        <EmptyState title="No staff records yet" />
      ) : (
        <div className="hr-table-wrap">
          <table className="data data-dense hr-data-table">
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
                      <div className="hr-staff-card">
                        <div className="hr-avatar" aria-hidden="true">
                          {initials(row.fullName)}
                        </div>
                        <div>
                          <div className="hr-cell-primary">{row.fullName}</div>
                          {row.email ? <div className="hr-cell-meta">{row.email}</div> : null}
                          {row.department ? (
                            <div className="hr-cell-meta">{row.department}</div>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td>
                      {row.jobCategory && row.jobCategory !== "custom"
                        ? row.jobCategory
                        : row.jobTitle ?? "—"}
                      {row.jobCategory === "custom" && row.jobTitle ? (
                        <div className="hr-cell-meta">{row.jobTitle}</div>
                      ) : null}
                    </td>
                    <td>
                      {row.userId
                        ? (
                          <>
                            {row.userFullName ?? row.userEmail ?? "Linked"}
                            {row.userIsLawyer ? (
                              <div className="hr-cell-meta">
                                Lawyer{row.userIsSystemUser === false ? " · no login" : ""}
                              </div>
                            ) : null}
                          </>
                        )
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
        </div>
      )}
    </HrPageShell>
  );
}
