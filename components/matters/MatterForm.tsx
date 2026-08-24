"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import {
  AREA_OF_LAW_OPTIONS,
  COURT_OTHER_VALUE,
  HARARE_COURT_OPTIONS,
  type MatterStatus,
} from "@/lib/db/mvp-types";
import {
  MATTER_PRIORITIES,
  MATTER_STATUSES,
  statusLabel,
} from "@/lib/matters/validation";
import { diagnosticJson, ensureRequestId } from "@/lib/diagnostics/client";

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
type LawyerOption = { id: string; fullName: string; isSystemUser?: boolean };

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

function courtSelectValue(courtName: string): string {
  if (!courtName) return "";
  if ((HARARE_COURT_OPTIONS as readonly string[]).includes(courtName)) {
    return courtName;
  }
  return COURT_OTHER_VALUE;
}

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
  const [courtChoice, setCourtChoice] = useState(() =>
    courtSelectValue(initialValues?.courtName ?? ""),
  );
  const [otherCourt, setOtherCourt] = useState(() => {
    const name = initialValues?.courtName ?? "";
    return courtSelectValue(name) === COURT_OTHER_VALUE ? name : "";
  });
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [lawyers, setLawyers] = useState<LawyerOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [errorRef, setErrorRef] = useState<string | null>(null);
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

  function onCourtChoiceChange(next: string) {
    setCourtChoice(next);
    if (next === COURT_OTHER_VALUE) {
      setField("courtName", otherCourt.trim());
      return;
    }
    setOtherCourt("");
    setField("courtName", next);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setErrorRef(null);
    setLoading(true);
    ensureRequestId();

    const resolvedCourt =
      courtChoice === COURT_OTHER_VALUE
        ? otherCourt.trim()
        : courtChoice.trim() || values.courtName.trim();

    if (courtChoice === COURT_OTHER_VALUE && !resolvedCourt) {
      setError("Enter the court name when selecting Other.");
      setLoading(false);
      return;
    }

    const payload = {
      clientId: values.clientId || null,
      title: values.title,
      description: values.description || null,
      areaOfLaw: values.areaOfLaw,
      status: values.status,
      // Create: system allocates. Edit: keep the existing number.
      matterNumber: mode === "edit" ? values.matterNumber || null : null,
      fileRef: values.fileRef || null,
      courtName: resolvedCourt || null,
      caseNumber: values.caseNumber || null,
      responsibleLawyerId: values.responsibleLawyerId || null,
      nextHearingAt: values.nextHearingAt || null,
      priority: values.priority,
    };

    try {
      const url = mode === "create" ? "/api/matters" : `/api/matters/${matterId}`;
      const method = mode === "create" ? "POST" : "PATCH";
      const result = await diagnosticJson<{ matter: { id: string } }>(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!result.ok) {
        setError(result.error?.message ?? "Could not save matter.");
        setErrorRef(result.requestId);
        return;
      }
      const id = result.data?.matter?.id ?? matterId;
      router.push(id ? `/matters/${id}` : "/matters");
      router.refresh();
    } catch {
      setError("Could not save matter. Check your connection.");
      setErrorRef(ensureRequestId());
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      {error ? (
        <p style={{ color: "var(--danger)", marginBottom: "1rem" }}>
          {error}
          {errorRef ? (
            <span
              className="muted"
              style={{ display: "block", fontSize: "0.78rem", marginTop: "0.35rem", wordBreak: "break-all" }}
            >
              Reference: {errorRef}
            </span>
          ) : null}
        </p>
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
          {mode === "create" ? (
            <>
              <input
                id="matterNumber"
                value=""
                disabled
                placeholder="Assigned automatically on save (MAT-0001)"
              />
              <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.78rem" }}>
                The system assigns the next matter number when you create the matter.
              </p>
            </>
          ) : (
            <input id="matterNumber" value={values.matterNumber} readOnly />
          )}
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
          <select
            id="courtName"
            value={courtChoice}
            onChange={(e) => onCourtChoiceChange(e.target.value)}
          >
            <option value="">Select court…</option>
            {HARARE_COURT_OPTIONS.map((court) => (
              <option key={court} value={court}>
                {court}
              </option>
            ))}
            <option value={COURT_OTHER_VALUE}>Other (specify)…</option>
          </select>
          {courtChoice === COURT_OTHER_VALUE ? (
            <input
              id="courtNameOther"
              style={{ marginTop: "0.5rem" }}
              value={otherCourt}
              onChange={(e) => {
                setOtherCourt(e.target.value);
                setField("courtName", e.target.value);
              }}
              placeholder="Court name and location"
              required
            />
          ) : null}
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
                {lawyer.isSystemUser === false ? " (no login)" : ""}
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
