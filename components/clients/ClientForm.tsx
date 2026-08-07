"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import type { ClientType } from "@/lib/db/mvp-types";

export type ClientFormValues = {
  clientType: ClientType;
  fullName: string;
  legalName: string;
  tradingName: string;
  nationalIdOrRegNumber: string;
  taxNumber: string;
  email: string;
  phone: string;
  altPhone: string;
  physicalAddress: string;
  postalAddress: string;
  kycNotes: string;
};

const emptyValues: ClientFormValues = {
  clientType: "individual",
  fullName: "",
  legalName: "",
  tradingName: "",
  nationalIdOrRegNumber: "",
  taxNumber: "",
  email: "",
  phone: "",
  altPhone: "",
  physicalAddress: "",
  postalAddress: "",
  kycNotes: "",
};

type ClientFormProps = {
  mode: "create" | "edit";
  clientId?: string;
  initialValues?: Partial<ClientFormValues>;
};

export function ClientForm({ mode, clientId, initialValues }: ClientFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<ClientFormValues>({
    ...emptyValues,
    ...initialValues,
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function setField<K extends keyof ClientFormValues>(key: K, value: ClientFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const payload = {
      clientType: values.clientType,
      fullName: values.fullName || null,
      legalName: values.legalName || null,
      tradingName: values.tradingName || null,
      nationalIdOrRegNumber: values.nationalIdOrRegNumber || null,
      taxNumber: values.taxNumber || null,
      email: values.email || null,
      phone: values.phone || null,
      altPhone: values.altPhone || null,
      physicalAddress: values.physicalAddress || null,
      postalAddress: values.postalAddress || null,
      kycNotes: values.kycNotes || null,
    };

    try {
      const url = mode === "create" ? "/api/clients" : `/api/clients/${clientId}`;
      const method = mode === "create" ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
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
      const id = body.data?.client?.id ?? clientId;
      router.push(id ? `/clients/${id}` : "/clients");
      router.refresh();
    } catch {
      setError("Could not save client. Check your connection.");
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
        <label htmlFor="clientType">Client type</label>
        <select
          id="clientType"
          value={values.clientType}
          onChange={(e) => setField("clientType", e.target.value as ClientType)}
        >
          <option value="individual">Individual</option>
          <option value="company">Company</option>
        </select>
      </div>

      {values.clientType === "individual" ? (
        <div className="form-group">
          <label htmlFor="fullName">Full name</label>
          <input
            id="fullName"
            value={values.fullName}
            onChange={(e) => setField("fullName", e.target.value)}
            required
          />
        </div>
      ) : (
        <>
          <div className="form-group">
            <label htmlFor="legalName">Legal name</label>
            <input
              id="legalName"
              value={values.legalName}
              onChange={(e) => setField("legalName", e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="tradingName">Trading name</label>
            <input
              id="tradingName"
              value={values.tradingName}
              onChange={(e) => setField("tradingName", e.target.value)}
            />
          </div>
        </>
      )}

      <div className="grid-2">
        <div className="form-group">
          <label htmlFor="nationalIdOrRegNumber">National ID / registration number</label>
          <input
            id="nationalIdOrRegNumber"
            value={values.nationalIdOrRegNumber}
            onChange={(e) => setField("nationalIdOrRegNumber", e.target.value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="taxNumber">Tax number</label>
          <input
            id="taxNumber"
            value={values.taxNumber}
            onChange={(e) => setField("taxNumber", e.target.value)}
          />
        </div>
      </div>

      <div className="grid-2">
        <div className="form-group">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={values.email}
            onChange={(e) => setField("email", e.target.value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="phone">Phone</label>
          <input
            id="phone"
            value={values.phone}
            onChange={(e) => setField("phone", e.target.value)}
          />
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="altPhone">Alternate phone</label>
        <input
          id="altPhone"
          value={values.altPhone}
          onChange={(e) => setField("altPhone", e.target.value)}
        />
      </div>

      <div className="form-group">
        <label htmlFor="physicalAddress">Physical address</label>
        <textarea
          id="physicalAddress"
          rows={2}
          value={values.physicalAddress}
          onChange={(e) => setField("physicalAddress", e.target.value)}
        />
      </div>

      <div className="form-group">
        <label htmlFor="postalAddress">Postal address</label>
        <textarea
          id="postalAddress"
          rows={2}
          value={values.postalAddress}
          onChange={(e) => setField("postalAddress", e.target.value)}
        />
      </div>

      <div className="form-group">
        <label htmlFor="kycNotes">KYC notes</label>
        <textarea
          id="kycNotes"
          rows={3}
          value={values.kycNotes}
          onChange={(e) => setField("kycNotes", e.target.value)}
        />
      </div>

      <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
        <Button type="submit" disabled={loading}>
          {loading ? "Saving…" : mode === "create" ? "Create client" : "Save changes"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={loading}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
