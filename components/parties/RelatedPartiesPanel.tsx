"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Can } from "@/components/auth/Can";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SortableTh } from "@/components/ui/SortableTh";
import {
  PARTY_ROLES,
  partyRoleLabel,
  type PartyRole,
} from "@/lib/parties/validation";
import { useTableSort } from "@/lib/ui/table-sort";

type PartyItem = {
  id: string;
  partyRole: string;
  partyRoleLabel: string;
  name: string;
  contact: string | null;
  notes: string | null;
  matterTitle: string | null;
};

type FormState = {
  partyRole: PartyRole;
  name: string;
  contact: string;
  notes: string;
};

const emptyForm: FormState = {
  partyRole: "opposing_party",
  name: "",
  contact: "",
  notes: "",
};

function roleTone(
  role: string,
): "open" | "pending" | "closed" | "danger" | "default" | "individual" | "company" {
  switch (role) {
    case "opposing_party":
      return "danger";
    case "spouse":
      return "individual";
    case "witness":
      return "pending";
    case "counsel":
      return "open";
    case "expert":
      return "company";
    default:
      return "default";
  }
}

type RelatedPartiesPanelProps = {
  /** matter | client */
  scope: "matter" | "client";
  scopeId: string;
  editPermission?: string;
  title?: string;
};

export function RelatedPartiesPanel({
  scope,
  scopeId,
  editPermission = scope === "matter" ? "matters.edit" : "clients.edit",
  title = "Related parties",
}: RelatedPartiesPanelProps) {
  const [items, setItems] = useState<PartyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const listUrl =
    scope === "matter"
      ? `/api/matters/${scopeId}/parties`
      : `/api/clients/${scopeId}/parties`;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(listUrl, { credentials: "include" });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { items: PartyItem[] };
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not load related parties.");
        setItems([]);
        return;
      }
      setItems(body.data?.items ?? []);
    } catch {
      setError("Could not load related parties.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [listUrl]);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate(role: PartyRole = "opposing_party") {
    setEditingId(null);
    setForm({ ...emptyForm, partyRole: role });
    setShowForm(true);
  }

  function openEdit(item: PartyItem) {
    setEditingId(item.id);
    setForm({
      partyRole: item.partyRole as PartyRole,
      name: item.name,
      contact: item.contact ?? "",
      notes: item.notes ?? "",
    });
    setShowForm(true);
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload = {
      partyRole: form.partyRole,
      name: form.name,
      contact: form.contact || null,
      notes: form.notes || null,
    };
    try {
      const url = editingId ? `/api/parties/${editingId}` : listUrl;
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not save related party.");
        return;
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      await load();
    } catch {
      setError("Could not save related party.");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: string) {
    if (!window.confirm("Remove this related party?")) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/parties/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const body = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not remove related party.");
        return;
      }
      await load();
    } catch {
      setError("Could not remove related party.");
    } finally {
      setSaving(false);
    }
  }

  const accessors = useMemo(
    () => ({
      name: (r: PartyItem) => r.name,
      role: (r: PartyItem) => r.partyRoleLabel || r.partyRole,
      contact: (r: PartyItem) => r.contact ?? "",
      matter: (r: PartyItem) => r.matterTitle ?? "",
    }),
    [],
  );
  const { sortedRows, sortKey, sortDir, toggleSort } = useTableSort(items, accessors, {
    key: "name",
    dir: "asc",
  });

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "0.75rem",
          marginBottom: "0.75rem",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h4 style={{ margin: 0 }}>{title}</h4>
          <p className="muted" style={{ margin: "0.25rem 0 0" }}>
            Opposing parties, witnesses, and other linked people
          </p>
        </div>
        <Can permission={editPermission}>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {scope === "matter" ? (
              <Button size="sm" variant="outline" onClick={() => openCreate("opposing_party")}>
                Quick add opposing party
              </Button>
            ) : null}
            <Button size="sm" onClick={() => openCreate("other")}>
              Add party
            </Button>
          </div>
        </Can>
      </div>

      {error ? (
        <p style={{ color: "var(--danger)", marginBottom: "0.75rem" }}>{error}</p>
      ) : null}

      {showForm ? (
        <form
          onSubmit={onSave}
          className="panel"
          style={{ padding: "1rem", marginBottom: "1rem" }}
        >
          <h4 style={{ marginTop: 0 }}>{editingId ? "Edit party" : "New party"}</h4>
          <div className="grid-2">
            <div className="form-group">
              <label htmlFor="party-role">Role</label>
              <select
                id="party-role"
                value={form.partyRole}
                onChange={(e) =>
                  setForm((f) => ({ ...f, partyRole: e.target.value as PartyRole }))
                }
              >
                {PARTY_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {partyRoleLabel(role)}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="party-name">Name</label>
              <input
                id="party-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="party-contact">Contact</label>
            <input
              id="party-contact"
              value={form.contact}
              onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
              placeholder="Phone, email, or firm"
            />
          </div>
          <div className="form-group">
            <label htmlFor="party-notes">Notes</label>
            <textarea
              id="party-notes"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
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
          </div>
        </form>
      ) : null}

      {loading ? (
        <p className="muted">Loading related parties…</p>
      ) : items.length === 0 ? (
        <p className="muted">No related parties yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <SortableTh label="Name" columnKey="name" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                <SortableTh label="Role" columnKey="role" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                <SortableTh label="Contact" columnKey="contact" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                {scope === "client" ? (
                  <SortableTh label="Matter" columnKey="matter" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                ) : null}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{item.name}</div>
                    {item.notes ? (
                      <div className="muted" style={{ fontSize: "0.85rem" }}>
                        {item.notes}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <Badge tone={roleTone(item.partyRole)}>{item.partyRoleLabel}</Badge>
                  </td>
                  <td>{item.contact ?? "—"}</td>
                  {scope === "client" ? <td>{item.matterTitle ?? "—"}</td> : null}
                  <td>
                    <Can permission={editPermission}>
                      <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={saving}
                          onClick={() => openEdit(item)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={saving}
                          onClick={() => onDelete(item.id)}
                        >
                          Remove
                        </Button>
                      </div>
                    </Can>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
