"use client";

import type { ChangeEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import { Can } from "@/components/auth/Can";
import { Button } from "@/components/ui/Button";

type FirmProfile = {
  id: string;
  name: string;
  slug: string;
  defaultCurrency: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  country: string | null;
  invoicePrefix: string;
  invoiceDueDays: number;
};

export function FirmProfilePanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [form, setForm] = useState<FirmProfile | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/firm/profile", { credentials: "include" });
      const body = (await res.json()) as {
        ok: boolean;
        data?: FirmProfile;
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Could not load firm profile.");
        return;
      }
      setForm(body.data);
    } catch {
      setError("Could not load firm profile.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!form) return;
    setSaving(true);
    setError(null);
    setOkMsg(null);
    try {
      const res = await fetch("/api/firm/profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          defaultCurrency: form.defaultCurrency,
          contactEmail: form.contactEmail,
          contactPhone: form.contactPhone,
          addressLine1: form.addressLine1,
          addressLine2: form.addressLine2,
          city: form.city,
          country: form.country,
          invoicePrefix: form.invoicePrefix,
          invoiceDueDays: form.invoiceDueDays,
          confirmProfile: true,
        }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: FirmProfile;
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Could not save.");
        return;
      }
      setForm(body.data);
      setOkMsg("Firm profile saved.");
    } catch {
      setError("Could not save firm profile.");
    } finally {
      setSaving(false);
    }
  };

  const set =
    (key: keyof FirmProfile) =>
    (e: ChangeEvent<HTMLInputElement>) => {
      if (!form) return;
      const value = e.target.value;
      setForm({ ...form, [key]: key === "invoiceDueDays" ? Number(value) : value });
    };

  return (
    <Can permission="settings.manage">
      <div style={{ display: "grid", gap: "1rem", maxWidth: "36rem" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Firm profile</h2>
          <p className="muted" style={{ margin: "0.25rem 0 0", fontSize: "0.85rem" }}>
            Name, contact, currency, and invoice numbering. Does not enable web lookup or telemetry.
          </p>
        </div>

        {loading ? <p className="muted">Loading…</p> : null}
        {error ? <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p> : null}
        {okMsg ? <p style={{ color: "var(--success, green)", margin: 0 }}>{okMsg}</p> : null}

        {form && !loading ? (
          <div style={{ display: "grid", gap: "0.75rem" }}>
            <label>
              Firm name
              <input className="input" value={form.name} onChange={set("name")} />
            </label>
            <label>
              Default currency
              <input
                className="input"
                value={form.defaultCurrency ?? ""}
                onChange={set("defaultCurrency")}
                placeholder="USD"
              />
            </label>
            <label>
              Invoice prefix
              <input
                className="input"
                value={form.invoicePrefix}
                onChange={set("invoicePrefix")}
                placeholder="INV"
              />
            </label>
            <label>
              Invoice due days
              <input
                className="input"
                type="number"
                min={0}
                max={365}
                value={form.invoiceDueDays}
                onChange={set("invoiceDueDays")}
              />
            </label>
            <label>
              Contact email
              <input
                className="input"
                type="email"
                value={form.contactEmail ?? ""}
                onChange={set("contactEmail")}
              />
            </label>
            <label>
              Contact phone
              <input
                className="input"
                value={form.contactPhone ?? ""}
                onChange={set("contactPhone")}
              />
            </label>
            <label>
              Address line 1
              <input
                className="input"
                value={form.addressLine1 ?? ""}
                onChange={set("addressLine1")}
              />
            </label>
            <label>
              Address line 2
              <input
                className="input"
                value={form.addressLine2 ?? ""}
                onChange={set("addressLine2")}
              />
            </label>
            <label>
              City
              <input className="input" value={form.city ?? ""} onChange={set("city")} />
            </label>
            <label>
              Country
              <input
                className="input"
                value={form.country ?? ""}
                onChange={set("country")}
              />
            </label>
            <div>
              <Button disabled={saving} onClick={() => void save()}>
                {saving ? "Saving…" : "Save firm profile"}
              </Button>
            </div>
            <p className="muted" style={{ fontSize: "0.8rem", margin: 0 }}>
              Slug: {form.slug} (fixed after setup)
            </p>
          </div>
        ) : null}
      </div>
    </Can>
  );
}
