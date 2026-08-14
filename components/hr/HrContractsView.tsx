"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Can } from "@/components/auth/Can";
import { HrAccessCallout } from "@/components/hr/HrAccessCallout";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { HR_CONTRACT_STATUSES } from "@/lib/hr/validation";

type ContractItem = {
  id: string;
  staffProfileId: string;
  staffName: string;
  staffIsActive: boolean;
  title: string;
  startDate: string;
  endDate: string | null;
  status: string;
  contractDocumentName: string | null;
  hasDocument: boolean;
  notes: string | null;
};

type StaffOption = { id: string; fullName: string; isActive: boolean };

function todayInput() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

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

function statusTone(status: string) {
  if (status === "active") return "open" as const;
  if (status === "draft") return "pending" as const;
  if (status === "terminated") return "danger" as const;
  return "closed" as const;
}

export function HrContractsView() {
  const { can } = useAuth();
  const canManage = can("hr.manage");

  const [contracts, setContracts] = useState<ContractItem[]>([]);
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const [staffFilter, setStaffFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [staffProfileId, setStaffProfileId] = useState("");
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState(todayInput);
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState("active");
  const [notes, setNotes] = useState("");

  const loadStaffOptions = useCallback(async () => {
    const res = await fetch("/api/hr/staff?activeOnly=1", { credentials: "include" });
    const body = (await res.json()) as {
      ok?: boolean;
      data?: { items: Array<{ id: string; fullName: string; isActive: boolean }> };
    };
    if (res.ok && body.ok && body.data) {
      setStaffOptions(
        body.data.items.map((s) => ({
          id: s.id,
          fullName: s.fullName,
          isActive: s.isActive,
        })),
      );
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (staffFilter) params.set("staffProfileId", staffFilter);
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/hr/contracts?${params.toString()}`, {
        credentials: "include",
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { items: ContractItem[] };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Could not load contracts.");
        return;
      }
      setContracts(body.data.items);
    } catch {
      setError("Could not load contracts.");
    } finally {
      setLoading(false);
    }
  }, [staffFilter, statusFilter]);

  useEffect(() => {
    void loadStaffOptions();
  }, [loadStaffOptions]);

  useEffect(() => {
    void load();
  }, [load]);

  function resetForm() {
    setEditingId(null);
    setStaffProfileId(staffFilter || (staffOptions[0]?.id ?? ""));
    setTitle("");
    setStartDate(todayInput());
    setEndDate("");
    setStatus("active");
    setNotes("");
    setFormOpen(false);
  }

  function openCreate() {
    resetForm();
    setFormOpen(true);
  }

  function openEdit(row: ContractItem) {
    setEditingId(row.id);
    setStaffProfileId(row.staffProfileId);
    setTitle(row.title);
    setStartDate(dateInputFromIso(row.startDate));
    setEndDate(dateInputFromIso(row.endDate));
    setStatus(row.status);
    setNotes(row.notes ?? "");
    setFormOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        staffProfileId,
        title,
        startDate,
        endDate: endDate || null,
        status,
        notes: notes || null,
      };
      const url = editingId ? `/api/hr/contracts/${editingId}` : "/api/hr/contracts";
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as { ok?: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not save contract.");
        return;
      }
      resetForm();
      await load();
    } catch {
      setError("Could not save contract.");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: string) {
    if (!canManage || !confirm("Delete this contract record?")) return;
    setError(null);
    try {
      const res = await fetch(`/api/hr/contracts/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const body = (await res.json()) as { ok?: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not delete contract.");
        return;
      }
      await load();
    } catch {
      setError("Could not delete contract.");
    }
  }

  async function onDownload(id: string) {
    try {
      const res = await fetch(`/api/hr/contracts/${id}/document`, { credentials: "include" });
      const body = (await res.json()) as {
        ok?: boolean;
        data?: { url: string; fileName: string | null };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data?.url) {
        setError(body.error?.message ?? "Could not download document.");
        return;
      }
      window.open(body.data.url, "_blank", "noopener,noreferrer");
    } catch {
      setError("Could not download document.");
    }
  }

  async function onUpload(id: string, file: File) {
    if (!canManage) return;
    setUploadingId(id);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch(`/api/hr/contracts/${id}/document`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const body = (await res.json()) as { ok?: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not upload document.");
        return;
      }
      await load();
    } catch {
      setError("Could not upload document.");
    } finally {
      setUploadingId(null);
    }
  }

  return (
    <section className="view active scrollable finance-desk-view" aria-label="HR contracts">
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Contracts</h3>
            <p className="panel-subtitle muted">
              Employment contracts per staff record · document upload
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
            <Can permission="hr.manage">
              <Button size="sm" onClick={() => openCreate()} disabled={loading}>
                Add contract
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
            <select
              className="filter-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              {HR_CONTRACT_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {error ? <p className="form-error" role="alert">{error}</p> : null}

          {formOpen && canManage ? (
            <form className="panel" style={{ padding: "1rem", marginBottom: "1rem" }} onSubmit={onSubmit}>
              <h4 style={{ marginBottom: "0.75rem" }}>
                {editingId ? "Edit contract" : "New contract"}
              </h4>
              <div className="form-grid" style={{ display: "grid", gap: "0.75rem", maxWidth: "640px" }}>
                <label>
                  Staff
                  <select
                    className="filter-select"
                    value={staffProfileId}
                    onChange={(e) => setStaffProfileId(e.target.value)}
                    required
                  >
                    <option value="">Select staff…</option>
                    {staffOptions.map((s) => (
                      <option key={s.id} value={s.id}>{s.fullName}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Title
                  <input className="filter-input" value={title} onChange={(e) => setTitle(e.target.value)} required />
                </label>
                <label>
                  Start date
                  <input className="filter-input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
                </label>
                <label>
                  End date
                  <input className="filter-input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </label>
                <label>
                  Status
                  <select className="filter-select" value={status} onChange={(e) => setStatus(e.target.value)}>
                    {HR_CONTRACT_STATUSES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label style={{ gridColumn: "1 / -1" }}>
                  Notes
                  <textarea className="filter-input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
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
            <p className="muted">Loading contracts…</p>
          ) : contracts.length === 0 ? (
            <EmptyState title="No contracts yet" />
          ) : (
            <table className="data data-dense">
              <thead>
                <tr>
                  <th>Staff</th>
                  <th>Contract</th>
                  <th>Period</th>
                  <th>Status</th>
                  <th>Document</th>
                  {canManage ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {contracts.map((row) => (
                  <tr key={row.id}>
                    <td>{row.staffName}</td>
                    <td><strong>{row.title}</strong></td>
                    <td>
                      {formatShortDate(row.startDate)}
                      {row.endDate ? ` to ${formatShortDate(row.endDate)}` : ""}
                    </td>
                    <td>
                      <Badge tone={statusTone(row.status)}>{row.status}</Badge>
                    </td>
                    <td>
                      {row.hasDocument ? (
                        <Button size="sm" variant="outline" onClick={() => onDownload(row.id)}>
                          {row.contractDocumentName ?? "Download"}
                        </Button>
                      ) : (
                        <span className="muted">None</span>
                      )}
                      {canManage ? (
                        <label style={{ display: "block", marginTop: "0.35rem" }}>
                          <input
                            type="file"
                            accept=".pdf,.doc,.docx,image/*"
                            disabled={uploadingId === row.id}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) void onUpload(row.id, file);
                              e.target.value = "";
                            }}
                            style={{ fontSize: "0.8rem" }}
                          />
                        </label>
                      ) : null}
                    </td>
                    {canManage ? (
                      <td style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                        <Button size="sm" variant="outline" onClick={() => openEdit(row)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => onDelete(row.id)}>
                          Delete
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
