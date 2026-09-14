"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { useSessionDraft } from "@/lib/client/session-draft";
import {
  EMPTY_CLIENT_KYC_FORM_VALUES,
  type ClientKycFormValues,
} from "@/lib/clients/kyc-form-values";
import {
  CLIENT_TYPES,
  KYC_STATUS_OPTIONS,
  SOURCE_OF_FUNDS_OPTIONS,
  clientTypeLabel,
  type ClientType,
  type UboRow,
} from "@/lib/clients/kyc-types";

export type { ClientKycFormValues } from "@/lib/clients/kyc-form-values";
export { toClientKycFormValues } from "@/lib/clients/kyc-form-values";

const emptyValues = EMPTY_CLIENT_KYC_FORM_VALUES;

type Props = {
  mode: "create" | "edit";
  clientId?: string;
  initialValues?: Partial<ClientKycFormValues>;
};

type LawyerOption = { id: string; fullName: string; email: string; isSystemUser?: boolean };

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="form-group">
      <span>
        {label}
        {required ? " *" : ""}
      </span>
      {children}
    </label>
  );
}

export function ClientKycWizard({ mode, clientId, initialValues }: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const [values, setValues] = useState<ClientKycFormValues>({
    ...emptyValues,
    ...initialValues,
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [kycPdfLoading, setKycPdfLoading] = useState(false);
  const [lawyers, setLawyers] = useState<LawyerOption[]>([]);
  const draftApplied = useRef(false);

  const draftId =
    mode === "create" || !clientId ? "client-kyc-new" : `client-kyc-${clientId}`;
  const { draftHint, clearDraft, applyRestored } = useSessionDraft<ClientKycFormValues>({
    userId: user?.id,
    draftId,
    values,
  });

  const isIndividual = values.clientType === "individual";
  const isEntity = !isIndividual;

  useEffect(() => {
    if (!user?.id || draftApplied.current) return;
    draftApplied.current = true;
    applyRestored((draft) => {
      setValues((prev) => ({ ...prev, ...draft }));
    });
  }, [user?.id, applyRestored]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/clients?includeLawyers=1", {
          credentials: "include",
        });
        const body = (await res.json()) as {
          ok?: boolean;
          data?: { lawyers?: LawyerOption[] };
        };
        if (!cancelled && res.ok && body.ok) {
          setLawyers(body.data?.lawyers ?? []);
        }
      } catch {
        /* optional lookup */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function setField<K extends keyof ClientKycFormValues>(key: K, value: ClientKycFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function updateUbo(index: number, patch: Partial<UboRow>) {
    setValues((prev) => {
      const rows = [...prev.uboJson];
      rows[index] = { ...rows[index], ...patch };
      return { ...prev, uboJson: rows };
    });
  }

  function buildPayload() {
    return {
      clientType: values.clientType,
      responsibleLawyerId: values.responsibleLawyerId || null,
      firstName: values.firstName || null,
      surname: values.surname || null,
      otherNames: values.otherNames || null,
      maidenName: values.maidenName || null,
      dateOfBirth: values.dateOfBirth || null,
      nationality: values.nationality || null,
      idNumber: values.idNumber || null,
      registeredName: values.registeredName || null,
      legalName: values.registeredName || null,
      tradingName: values.tradingName || null,
      regTaxNumber: values.regTaxNumber || null,
      taxNumber: values.regTaxNumber || null,
      incorporationDate: values.incorporationDate || null,
      incorporationCountry: values.incorporationCountry || null,
      registeredAddress: values.registeredAddress || null,
      businessAddress: values.businessAddress || null,
      industry: values.industry || null,
      email: values.email || null,
      phone: values.phone || null,
      whatsapp: values.whatsapp || null,
      altPhone: values.altPhone || null,
      residentialAddress: values.residentialAddress || null,
      physicalAddress: values.residentialAddress || null,
      postalAddress: values.postalAddress || null,
      occupation: values.occupation || null,
      employer: values.employer || null,
      pepStatus: values.pepStatus,
      pepDetails: values.pepDetails || null,
      uboJson: values.uboJson,
      matterScopePurpose: values.matterScopePurpose || null,
      sourceOfFunds: values.sourceOfFunds || null,
      sourceOfFundsOther: values.sourceOfFundsOther || null,
      kycDocumentsJson: values.kycDocumentsJson,
      declarationSignedAt: values.declarationSignedAt || null,
      declarationSignatory: values.declarationSignatory || null,
      kycStatus: values.kycStatus,
      kycNotes: values.kycNotes || null,
    };
  }

  async function onDownloadKycPdf() {
    if (!clientId) return;
    setKycPdfLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/kyc-pdf`, {
        credentials: "include",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(body?.error?.message ?? "Could not download KYC PDF.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `KYC-${clientId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not download KYC PDF.");
    } finally {
      setKycPdfLoading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const url = mode === "create" ? "/api/clients" : `/api/clients/${clientId}`;
      const method = mode === "create" ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(buildPayload()),
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { client: { id: string } };
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not save client.");
        return;
      }
      clearDraft();
      const id = body.data?.client?.id ?? clientId;
      if (mode === "create" && id) {
        router.push(`/clients/${id}?conflict=1`);
      } else {
        router.push(id ? `/clients/${id}` : "/clients");
      }
      router.refresh();
    } catch {
      setError("Could not save client. Check your connection.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="client-kyc-wizard" onSubmit={onSubmit}>
      {error ? <p className="error-text">{error}</p> : null}
      {draftHint ? (
        <p className="muted" style={{ marginTop: 0, fontSize: "0.85rem" }}>
          {draftHint}
        </p>
      ) : null}

      <section className="kyc-section">
        <h4>1. Client classification</h4>
        <Field label="Client type" required>
          <select
            value={values.clientType}
            onChange={(e) => setField("clientType", e.target.value as ClientType)}
          >
            {CLIENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {clientTypeLabel(t)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Responsible lawyer">
          <select
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
        </Field>
      </section>

      {isIndividual ? (
        <section className="kyc-section">
          <h4>2. Individual details</h4>
          <div className="grid-2">
            <Field label="First name" required>
              <input
                value={values.firstName}
                onChange={(e) => setField("firstName", e.target.value)}
                required
              />
            </Field>
            <Field label="Surname" required>
              <input
                value={values.surname}
                onChange={(e) => setField("surname", e.target.value)}
                required
              />
            </Field>
          </div>
          <div className="grid-2">
            <Field label="Other names">
              <input
                value={values.otherNames}
                onChange={(e) => setField("otherNames", e.target.value)}
              />
            </Field>
            <Field label="Maiden name">
              <input
                value={values.maidenName}
                onChange={(e) => setField("maidenName", e.target.value)}
              />
            </Field>
          </div>
          <div className="grid-2">
            <Field label="Date of birth">
              <input
                type="date"
                value={values.dateOfBirth}
                onChange={(e) => setField("dateOfBirth", e.target.value)}
              />
            </Field>
            <Field label="Nationality">
              <input
                value={values.nationality}
                onChange={(e) => setField("nationality", e.target.value)}
              />
            </Field>
          </div>
          <Field label="National ID number">
            <input value={values.idNumber} onChange={(e) => setField("idNumber", e.target.value)} />
          </Field>
          <div className="grid-2">
            <Field label="Occupation">
              <input
                value={values.occupation}
                onChange={(e) => setField("occupation", e.target.value)}
              />
            </Field>
            <Field label="Employer">
              <input value={values.employer} onChange={(e) => setField("employer", e.target.value)} />
            </Field>
          </div>
        </section>
      ) : (
        <section className="kyc-section">
          <h4>2. {clientTypeLabel(values.clientType)} details</h4>
          <Field label="Registered name" required>
            <input
              value={values.registeredName}
              onChange={(e) => setField("registeredName", e.target.value)}
              required
            />
          </Field>
          <div className="grid-2">
            <Field label="Trading name">
              <input
                value={values.tradingName}
                onChange={(e) => setField("tradingName", e.target.value)}
              />
            </Field>
            <Field label="Registration / tax number">
              <input
                value={values.regTaxNumber}
                onChange={(e) => setField("regTaxNumber", e.target.value)}
              />
            </Field>
          </div>
          <div className="grid-2">
            <Field label="Incorporation date">
              <input
                type="date"
                value={values.incorporationDate}
                onChange={(e) => setField("incorporationDate", e.target.value)}
              />
            </Field>
            <Field label="Incorporation country">
              <input
                value={values.incorporationCountry}
                onChange={(e) => setField("incorporationCountry", e.target.value)}
              />
            </Field>
          </div>
          <Field label="Industry">
            <input value={values.industry} onChange={(e) => setField("industry", e.target.value)} />
          </Field>
          <Field label="Registered address">
            <textarea
              rows={2}
              value={values.registeredAddress}
              onChange={(e) => setField("registeredAddress", e.target.value)}
            />
          </Field>
          <Field label="Business address">
            <textarea
              rows={2}
              value={values.businessAddress}
              onChange={(e) => setField("businessAddress", e.target.value)}
            />
          </Field>
        </section>
      )}

      <section className="kyc-section">
        <h4>3. Contact</h4>
        <div className="grid-2">
          <Field label="Phone" required>
            <input value={values.phone} onChange={(e) => setField("phone", e.target.value)} required />
          </Field>
          <Field label="WhatsApp" required>
            <input
              value={values.whatsapp}
              onChange={(e) => setField("whatsapp", e.target.value)}
              required
            />
          </Field>
        </div>
        <div className="grid-2">
          <Field label="Email">
            <input
              type="email"
              value={values.email}
              onChange={(e) => setField("email", e.target.value)}
            />
          </Field>
          <Field label="Alternate phone">
            <input value={values.altPhone} onChange={(e) => setField("altPhone", e.target.value)} />
          </Field>
        </div>
        {isIndividual ? (
          <Field label="Residential address">
            <textarea
              rows={2}
              value={values.residentialAddress}
              onChange={(e) => setField("residentialAddress", e.target.value)}
            />
          </Field>
        ) : null}
        <Field label="Postal address">
          <textarea
            rows={2}
            value={values.postalAddress}
            onChange={(e) => setField("postalAddress", e.target.value)}
          />
        </Field>
      </section>

      {isEntity ? (
        <section className="kyc-section">
          <h4>4. Ultimate beneficial owners</h4>
          {values.uboJson.map((ubo, idx) => (
            <div key={idx} className="ubo-row">
              <div className="grid-2">
                <Field label="Full name">
                  <input
                    value={ubo.fullName}
                    onChange={(e) => updateUbo(idx, { fullName: e.target.value })}
                  />
                </Field>
                <Field label="Control %">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={ubo.controlPct ?? ""}
                    onChange={(e) =>
                      updateUbo(idx, {
                        controlPct: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  />
                </Field>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() =>
                  setField(
                    "uboJson",
                    values.uboJson.filter((_, i) => i !== idx),
                  )
                }
              >
                Remove UBO
              </Button>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              setField("uboJson", [
                ...values.uboJson,
                { fullName: "", dob: "", nationality: "", address: "", controlPct: null },
              ])
            }
          >
            Add UBO
          </Button>
        </section>
      ) : null}

      <section className="kyc-section">
        <h4>{isEntity ? "5" : "4"}. Matter and source of funds</h4>
        <Field label="Purpose of representation">
          <textarea
            rows={2}
            value={values.matterScopePurpose}
            onChange={(e) => setField("matterScopePurpose", e.target.value)}
          />
        </Field>
        <div className="grid-2">
          <Field label="Source of funds">
            <select
              value={values.sourceOfFunds}
              onChange={(e) => setField("sourceOfFunds", e.target.value)}
            >
              <option value="">Select…</option>
              {SOURCE_OF_FUNDS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          {values.sourceOfFunds === "other" ? (
            <Field label="Other source details">
              <input
                value={values.sourceOfFundsOther}
                onChange={(e) => setField("sourceOfFundsOther", e.target.value)}
              />
            </Field>
          ) : null}
        </div>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={values.pepStatus}
            onChange={(e) => setField("pepStatus", e.target.checked)}
          />
          Politically exposed person (PEP)
        </label>
        {values.pepStatus ? (
          <Field label="PEP details">
            <textarea
              rows={2}
              value={values.pepDetails}
              onChange={(e) => setField("pepDetails", e.target.value)}
            />
          </Field>
        ) : null}
      </section>

      <section className="kyc-section">
        <h4>{isEntity ? "6" : "5"}. Documents checklist</h4>
        <div className="checkbox-grid">
          {(
            [
              ["idDocument", "ID document"],
              ["proofOfAddress", "Proof of address"],
              ["companyRegistration", "Company registration"],
              ["taxClearance", "Tax clearance"],
              ["trustDeed", "Trust deed"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="checkbox-row">
              <input
                type="checkbox"
                checked={Boolean(values.kycDocumentsJson[key])}
                onChange={(e) =>
                  setField("kycDocumentsJson", {
                    ...values.kycDocumentsJson,
                    [key]: e.target.checked,
                  })
                }
              />
              {label}
            </label>
          ))}
        </div>
      </section>

      <section className="kyc-section">
        <h4>{isEntity ? "7" : "6"}. Declaration</h4>
        <div className="grid-2">
          <Field label="Signatory name">
            <input
              value={values.declarationSignatory}
              onChange={(e) => setField("declarationSignatory", e.target.value)}
            />
          </Field>
          <Field label="Signed date">
            <input
              type="date"
              value={values.declarationSignedAt}
              onChange={(e) => setField("declarationSignedAt", e.target.value)}
            />
          </Field>
        </div>
        <Field label="KYC status">
          <select
            value={values.kycStatus}
            onChange={(e) => setField("kycStatus", e.target.value)}
          >
            {KYC_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Internal KYC notes">
          <textarea
            rows={3}
            value={values.kycNotes}
            onChange={(e) => setField("kycNotes", e.target.value)}
          />
        </Field>
      </section>

      <p className="muted">
        Fields marked * are required on create: client type, first name, surname (individuals),
        registered name (entities), phone, and WhatsApp.
      </p>

      <div className="form-actions">
        <Button type="submit" disabled={loading}>
          {loading ? "Saving…" : mode === "create" ? "Create client" : "Save KYC"}
        </Button>
        {mode === "edit" && clientId ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => void onDownloadKycPdf()}
            disabled={loading || kycPdfLoading}
          >
            {kycPdfLoading ? "Preparing…" : "Download KYC PDF"}
          </Button>
        ) : null}
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={loading}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
