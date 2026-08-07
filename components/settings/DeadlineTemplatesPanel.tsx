"use client";

import { useCallback, useEffect, useState } from "react";
import { Can } from "@/components/auth/Can";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  DEADLINE_TEMPLATE_EVENT_TYPES,
  type DeadlineTemplateEventType,
} from "@/lib/deadlines/validation";

type Template = {
  id: string;
  name: string;
  areaOfLaw: string | null;
  description: string | null;
  offsetDays: number;
  defaultEventType: string;
  isActive: boolean;
};

type FormState = {
  name: string;
  areaOfLaw: string;
  description: string;
  offsetDays: string;
  defaultEventType: DeadlineTemplateEventType;
  isActive: boolean;
};

const emptyForm: FormState = {
  name: "",
  areaOfLaw: "",
  description: "",
  offsetDays: "14",
  defaultEventType: "filing",
  isActive: true,
};

export function DeadlineTemplatesPanel() {
  const [items, setItems] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = showInactive ? "?active=all" : "";
      const res = await fetch(`/api/deadline-templates${params}`, {
        credentials: "include",
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { items: Template[] };
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not load deadline templates.");
        setItems([]);
        return;
      }
      setItems(body.data?.items ?? []);
    } catch {
      setError("Could not load deadline templates.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [showInactive]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(t: Template) {
    setEditingId(t.id);
    setForm({
      name: t.name,
      areaOfLaw: t.areaOfLaw ?? "",
      description: t.description ?? "",
      offsetDays: String(t.offsetDays),
      defaultEventType: (DEADLINE_TEMPLATE_EVENT_TYPES.includes(
        t.defaultEventType as DeadlineTemplateEventType,
      )
        ? t.defaultEventType
        : "filing") as DeadlineTemplateEventType,
      isActive: t.isActive,
    });
    setFormError(null);
    setFormOpen(true);
  }

  async function save() {
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        name: form.name,
        areaOfLaw: form.areaOfLaw || null,
        description: form.description || null,
        offsetDays: Number(form.offsetDays),
        defaultEventType: form.defaultEventType,
        isActive: form.isActive,
      };
      const url = editingId
        ? `/api/deadline-templates/${editingId}`
        : "/api/deadline-templates";
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
        setFormError(body.error?.message ?? "Could not save template.");
        return;
      }
      setFormOpen(false);
      setEditingId(null);
      await load();
    } catch {
      setFormError("Could not save template.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this deadline template?")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/deadline-templates/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const body = (await res.json()) as {
        ok: boolean;
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not delete template.");
        return;
      }
      setFormOpen(false);
      await load();
    } catch {
      setError("Could not delete template.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="panel-head">
        <h3>Deadline templates</h3>
        <Can permission="calendar.manage">
          <Button size="sm" onClick={openCreate}>
            New template
          </Button>
        </Can>
      </div>
      <div className="panel-body">
        <p className="muted" style={{ marginTop: 0, fontSize: "0.8rem" }}>
          Operational helper for filing offsets (calendar days). Not legal advice. Apply templates
          from a matter Deadlines tab.
        </p>

        <div className="toolbar" style={{ marginBottom: "0.75rem" }}>
          <label style={{ display: "flex", gap: "0.4rem", alignItems: "center", fontSize: "0.8rem" }}>
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Show inactive
          </label>
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

        {formOpen ? (
          <div className="panel" style={{ marginBottom: "1rem", padding: "1rem" }}>
            <h4 style={{ marginTop: 0 }}>{editingId ? "Edit template" : "New template"}</h4>
            {formError ? (
              <p role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem" }}>
                {formError}
              </p>
            ) : null}
            <div className="form-group">
              <label htmlFor="dt-name">Name</label>
              <input
                id="dt-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Notice of appearance (+10 days)"
              />
            </div>
            <div className="grid-2">
              <div className="form-group">
                <label htmlFor="dt-offset">Offset days</label>
                <input
                  id="dt-offset"
                  type="number"
                  value={form.offsetDays}
                  onChange={(e) => setForm((f) => ({ ...f, offsetDays: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label htmlFor="dt-type">Calendar event type</label>
                <select
                  id="dt-type"
                  value={form.defaultEventType}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      defaultEventType: e.target.value as DeadlineTemplateEventType,
                    }))
                  }
                >
                  {DEADLINE_TEMPLATE_EVENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="dt-area">Area of law (optional)</label>
              <input
                id="dt-area"
                value={form.areaOfLaw}
                onChange={(e) => setForm((f) => ({ ...f, areaOfLaw: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label htmlFor="dt-desc">Description</label>
              <textarea
                id="dt-desc"
                rows={2}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                />
                Active
              </label>
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <Button size="sm" onClick={save} disabled={saving || !form.name.trim()}>
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={saving}
                onClick={() => {
                  setFormOpen(false);
                  setEditingId(null);
                }}
              >
                Cancel
              </Button>
              {editingId ? (
                <Button
                  size="sm"
                  variant="danger"
                  disabled={saving}
                  onClick={() => remove(editingId)}
                >
                  Delete
                </Button>
              ) : null}
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
            title="No deadline templates"
            detail="Create offsets such as +14 days from a trigger date."
          />
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>Offset</th>
                <th>Type</th>
                <th>Area</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id}>
                  <td>
                    <div>{t.name}</div>
                    {t.description ? (
                      <div className="muted" style={{ fontSize: "0.75rem" }}>
                        {t.description}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    {t.offsetDays >= 0 ? `+${t.offsetDays}` : t.offsetDays} days
                  </td>
                  <td>{t.defaultEventType}</td>
                  <td>{t.areaOfLaw ?? "Any"}</td>
                  <td>
                    <Badge tone={t.isActive ? "open" : "closed"}>
                      {t.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td>
                    <Can permission="calendar.manage">
                      <Button size="sm" variant="outline" onClick={() => openEdit(t)}>
                        Edit
                      </Button>
                    </Can>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
