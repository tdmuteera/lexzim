"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { AREA_OF_LAW_OPTIONS, type MatterStatus } from "@/lib/db/mvp-types";
import {
  MATTER_PRIORITIES,
  MATTER_STATUSES,
  statusLabel,
} from "@/lib/matters/validation";

export type MatterFormValues = {
  clientId: string;
  title: string;
  description: string;
  areaOfLaw: string;
  status: MatterStatus;
  matterNumber: string;
  fileRef: string;
  courtName: string;
  caseNumber: string;
  responsibleLawyerId: string;
  nextHearingAt: string;
  priority: string;
};

type ClientOption = { id: string; displayLabel: string };
type LawyerOption = { id: string; fullName: string };

type MatterFormProps = {
  mode: "create" | "edit";
  matterId?: string;
  initialValues?: Partial<MatterFormValues>;
  lockClient?: boolean;
};

const emptyValues: MatterFormValues = {
  clientId: "",
  title: "",
  description: "",
  areaOfLaw: "Civil",
  status: "prospective",
  matterNumber: "",
  fileRef: "",
  courtName: "",
  caseNumber: "",
  responsibleLawyerId: "",
  nextHearingAt: "",
  priority: "normal",
};

export function MatterForm({
  mode,
  matterId,
  initialValues,
  lockClient = false,
}: MatterFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<MatterFormValues>({
    ...emptyValues,
    ...initialValues,
  });
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [lawyers, setLawyers] = useState<LawyerOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadOptions() {
      try {
        const [clientsRes, mattersRes] = await Promise.all([
          fetch("/api/clients?archived=active&sort=name", { credentials: "include" }),
          fetch("/api/matters?bucket=all&includeLawyers=1", { credentials: "include" }),
        ]);
        const clientsBody = (await clientsRes.json()) as {
          ok: boolean;
          data?: { items: Array<{ id: string; displayLabel: string; displayName: string }> };
        };
        const mattersBody = (await mattersRes.json()) as {
          ok: boolean;
          data?: { lawyers?: LawyerOption[] };
        };
        if (clientsBody.ok) {
          setClients(
            (clientsBody.data?.items ?? []).map((c) => ({
              id: c.id,
              displayLabel: c.displayLabel ?? c.displayName,
            })),
          );
        }
        if (mattersBody.ok) {
          setLawyers(mattersBody.data?.lawyers ?? []);
        }
      } catch {
        // Options stay empty; form still usable if ids are prefilled.
      }
    }
    loadOptions();
  }, []);

  function setField<K extends keyof MatterFormValues>(key: K, value: MatterFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const payload = {
      clientId: values.clientId || null,
      title: values.title,
      description: values.description || null,
      areaOfLaw: values.areaOfLaw,
      status: values.status,
      matterNumber: values.matterNumber || null,
      fileRef: values.fileRef || null,
      courtName: values.courtName || null,
      caseNumber: values.caseNumber || null,
      responsibleLawyerId: values.responsibleLawyerId || null,
      nextHearingAt: values.nextHearingAt || null,
      priority: values.priority,
    };

    try {
      const url = mode === "create" ? "/api/matters" : `/api/matters/${matterId}`;
      const method = mode === "create" ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { matter: { id: string } };
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not save matter.");
        return;
      }
      const id = body.data?.matter?.id ?? matterId;
      router.push(id ? `/matters/${id}` : "/matters");
      router.refresh();
    } catch {
      setError("Could not save matter. Check your connection.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      {error ? (
        <p style={{ color: "var(--danger)", marginBottom: "1rem" }}>{error}</p>
      ) : null}

      <div className="form-group">
        <label htmlFor="clientId">Client</label>
        <select
          id="clientId"
          value={values.clientId}
          onChange={(e) => setField("clientId", e.target.value)}
          required
          disabled={lockClient && mode === "edit"}
        >
          <option value="">Select client…</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.displayLabel}
            </option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label htmlFor="title">Title</label>
        <input
          id="title"
          value={values.title}
          onChange={(e) => setField("title", e.target.value)}
          required
        />
      </div>

      <div className="form-group">
        <label htmlFor="description">Description</label>
        <textarea
          id="description"
          rows={3}
          value={values.description}
          onChange={(e) => setField("description", e.target.value)}
        />
      </div>

      <div className="grid-2">
        <div className="form-group">
          <label htmlFor="areaOfLaw">Area of law</label>
          <select
            id="areaOfLaw"
            value={values.areaOfLaw}
            onChange={(e) => setField("areaOfLaw", e.target.value)}
            required
          >
            {AREA_OF_LAW_OPTIONS.map((area) => (
              <option key={area} value={area}>
                {area}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="status">Status</label>
          <select
            id="status"
            value={values.status}
            onChange={(e) => setField("status", e.target.value as MatterStatus)}
          >
            {MATTER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid-2">
        <div className="form-group">
          <label htmlFor="matterNumber">Matter number</label>
          <input
            id="matterNumber"
            value={values.matterNumber}
            onChange={(e) => setField("matterNumber", e.target.value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="fileRef">File reference</label>
          <input
            id="fileRef"
            value={values.fileRef}
            onChange={(e) => setField("fileRef", e.target.value)}
          />
        </div>
      </div>

      <div className="grid-2">
        <div className="form-group">
          <label htmlFor="courtName">Court</label>
          <input
            id="courtName"
            value={values.courtName}
            onChange={(e) => setField("courtName", e.target.value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="caseNumber">Case number</label>
          <input
            id="caseNumber"
            value={values.caseNumber}
            onChange={(e) => setField("caseNumber", e.target.value)}
          />
        </div>
      </div>

      <div className="grid-2">
        <div className="form-group">
          <label htmlFor="responsibleLawyerId">Responsible lawyer</label>
          <select
            id="responsibleLawyerId"
            value={values.responsibleLawyerId}
            onChange={(e) => setField("responsibleLawyerId", e.target.value)}
          >
            <option value="">Unassigned</option>
            {lawyers.map((lawyer) => (
              <option key={lawyer.id} value={lawyer.id}>
                {lawyer.fullName}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="nextHearingAt">Next hearing</label>
          <input
            id="nextHearingAt"
            type="datetime-local"
            value={values.nextHearingAt}
            onChange={(e) => setField("nextHearingAt", e.target.value)}
          />
          <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.78rem" }}>
            Shown on Calendar and Reminders (Hearings).
          </p>
        </div>
      </div>

      <div className="grid-2">
        <div className="form-group">
          <label htmlFor="priority">Priority</label>
          <select
            id="priority"
            value={values.priority}
            onChange={(e) => setField("priority", e.target.value)}
          >
            {MATTER_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
        <Button type="submit" disabled={loading}>
          {loading ? "Saving…" : mode === "create" ? "Create matter" : "Save changes"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={loading}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
