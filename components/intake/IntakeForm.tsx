"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export type IntakeFormValues = {
  prospectName: string;
  contactEmail: string;
  contactPhone: string;
  areaOfLaw: string;
  matterSummary: string;
  opposingParty: string;
  assignedTo: string;
  status: string;
};

type Assignee = { id: string; fullName: string };

type IntakeFormProps = {
  mode: "create" | "edit";
  intakeId?: string;
  initial?: Partial<IntakeFormValues>;
};

const empty: IntakeFormValues = {
  prospectName: "",
  contactEmail: "",
  contactPhone: "",
  areaOfLaw: "",
  matterSummary: "",
  opposingParty: "",
  assignedTo: "",
  status: "open",
};

export function IntakeForm({ mode, intakeId, initial }: IntakeFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<IntakeFormValues>({ ...empty, ...initial });
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/intakes?includeAssignees=1&status=open", {
          credentials: "include",
        });
        const body = (await res.json()) as {
          data?: { assignees?: Assignee[] };
        };
        if (!cancelled && body.data?.assignees) setAssignees(body.data.assignees);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (initial) setForm((f) => ({ ...f, ...initial }));
  }, [initial]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        prospectName: form.prospectName,
        contactEmail: form.contactEmail || null,
        contactPhone: form.contactPhone || null,
        areaOfLaw: form.areaOfLaw || null,
        matterSummary: form.matterSummary || null,
        opposingParty: form.opposingParty || null,
        assignedTo: form.assignedTo || null,
        status: form.status || "open",
      };
      const url = mode === "create" ? "/api/intakes" : `/api/intakes/${intakeId}`;
      const method = mode === "create" ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { intake: { id: string } };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Could not save intake.");
        return;
      }
      router.push(`/intake/${body.data.intake.id}`);
      router.refresh();
    } catch {
      setError("Could not save intake.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="panel" style={{ padding: "1rem" }}>
      <h4 style={{ marginTop: 0 }}>
        {mode === "create" ? "New intake" : "Edit intake"}
      </h4>
      <p className="muted" style={{ fontSize: "0.8rem" }}>
        Prospect capture only. No client or matter is created on save.
      </p>
      {error ? (
        <p role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem" }}>
          {error}
        </p>
      ) : null}
      <div className="form-group">
        <label htmlFor="in-name">Prospect name</label>
        <input
          id="in-name"
          value={form.prospectName}
          onChange={(e) => setForm((f) => ({ ...f, prospectName: e.target.value }))}
          required
        />
      </div>
      <div className="grid-2">
        <div className="form-group">
          <label htmlFor="in-email">Email</label>
          <input
            id="in-email"
            type="email"
            value={form.contactEmail}
            onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
          />
        </div>
        <div className="form-group">
          <label htmlFor="in-phone">Phone</label>
          <input
            id="in-phone"
            value={form.contactPhone}
            onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))}
          />
        </div>
      </div>
      <div className="grid-2">
        <div className="form-group">
          <label htmlFor="in-area">Area of law</label>
          <input
            id="in-area"
            value={form.areaOfLaw}
            onChange={(e) => setForm((f) => ({ ...f, areaOfLaw: e.target.value }))}
          />
        </div>
        <div className="form-group">
          <label htmlFor="in-assign">Assigned to</label>
          <select
            id="in-assign"
            value={form.assignedTo}
            onChange={(e) => setForm((f) => ({ ...f, assignedTo: e.target.value }))}
          >
            <option value="">Unassigned</option>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.fullName}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="form-group">
        <label htmlFor="in-opp">Opposing party</label>
        <input
          id="in-opp"
          value={form.opposingParty}
          onChange={(e) => setForm((f) => ({ ...f, opposingParty: e.target.value }))}
          placeholder="Name(s) for conflict search later"
        />
      </div>
      <div className="form-group">
        <label htmlFor="in-sum">Matter summary</label>
        <textarea
          id="in-sum"
          rows={4}
          value={form.matterSummary}
          onChange={(e) => setForm((f) => ({ ...f, matterSummary: e.target.value }))}
        />
      </div>
      {mode === "edit" ? (
        <div className="form-group">
          <label htmlFor="in-status">Status</label>
          <select
            id="in-status"
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
          >
            <option value="open">Open</option>
            <option value="declined">Declined</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      ) : null}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push("/intake")}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
