"use client";

import type { ChangeEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import { Can } from "@/components/auth/Can";
import { Button } from "@/components/ui/Button";
import {
  EMPTY_INVOICE_BANKING,
  type InvoiceBankingDetails,
} from "@/lib/billing/invoice-banking";

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
  invoiceAttorneyLine: string | null;
  invoicePaymentNote: string | null;
  invoiceClosingNote: string | null;
  invoiceBanking: InvoiceBankingDetails;
  requireInvoiceApproval: boolean;
  requireClearConflict: boolean;
  blockDisbursementIfTrustShort: boolean;
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
      setForm({
        ...body.data,
        requireInvoiceApproval: body.data.requireInvoiceApproval !== false,
        requireClearConflict: body.data.requireClearConflict !== false,
        blockDisbursementIfTrustShort:
          body.data.blockDisbursementIfTrustShort === true,
        invoiceBanking: {
          ...EMPTY_INVOICE_BANKING,
          ...(body.data.invoiceBanking ?? {}),
        },
      });
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
          invoiceAttorneyLine: form.invoiceAttorneyLine,
          invoicePaymentNote: form.invoicePaymentNote,
          invoiceClosingNote: form.invoiceClosingNote,
          invoiceBanking: form.invoiceBanking,
          requireInvoiceApproval: form.requireInvoiceApproval,
          requireClearConflict: form.requireClearConflict,
          blockDisbursementIfTrustShort: form.blockDisbursementIfTrustShort,
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
      setForm({
        ...body.data,
        requireInvoiceApproval: body.data.requireInvoiceApproval !== false,
        requireClearConflict: body.data.requireClearConflict !== false,
        blockDisbursementIfTrustShort:
          body.data.blockDisbursementIfTrustShort === true,
        invoiceBanking: {
          ...EMPTY_INVOICE_BANKING,
          ...(body.data.invoiceBanking ?? {}),
        },
      });
      setOkMsg("Firm profile saved.");
    } catch {
      setError("Could not save firm profile.");
    } finally {
      setSaving(false);
    }
  };

  const set =
    (key: keyof FirmProfile) =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (!form) return;
      const value = e.target.value;
      setForm({ ...form, [key]: key === "invoiceDueDays" ? Number(value) : value });
    };

  const setBank =
    (key: keyof InvoiceBankingDetails) =>
    (e: ChangeEvent<HTMLInputElement>) => {
      if (!form) return;
      setForm({
        ...form,
        invoiceBanking: { ...form.invoiceBanking, [key]: e.target.value },
      });
    };

  return (
    <Can permission="settings.manage">
      <div className="settings-form">
        <div className="settings-form-head">
          <p className="settings-lede">
            Name, contact, currency, invoice letterhead, and banking. Each firm (including
            Isolation) uses its own details on printed invoices.
          </p>
          {loading ? <span className="muted">Loading…</span> : null}
          {error ? (
            <p style={{ color: "var(--danger)", margin: 0, fontSize: "0.9rem" }}>{error}</p>
          ) : null}
          {okMsg ? (
            <p style={{ color: "var(--success)", margin: 0, fontSize: "0.9rem" }}>{okMsg}</p>
          ) : null}
        </div>

        {form && !loading ? (
          <>
            <section className="settings-section">
              <h3 className="settings-section-title">Firm identity</h3>
              <div className="settings-fields cols-2">
                <label className="settings-field">
                  <span>Firm name</span>
                  <input className="input" value={form.name} onChange={set("name")} />
                </label>
                <label className="settings-field">
                  <span>Default currency</span>
                  <input
                    className="input"
                    value={form.defaultCurrency ?? ""}
                    onChange={set("defaultCurrency")}
                    placeholder="USD"
                  />
                </label>
              </div>
              <p className="settings-hint">Slug: {form.slug} (fixed after setup)</p>
            </section>

            <section className="settings-section">
              <h3 className="settings-section-title">Invoicing</h3>
              <div className="settings-fields cols-2">
                <label className="settings-field">
                  <span>Invoice prefix</span>
                  <input
                    className="input"
                    value={form.invoicePrefix}
                    onChange={set("invoicePrefix")}
                    placeholder="INV"
                  />
                </label>
                <label className="settings-field">
                  <span>Invoice due days</span>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={365}
                    value={form.invoiceDueDays}
                    onChange={set("invoiceDueDays")}
                  />
                </label>
              </div>
              <label
                className="settings-field"
                style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", marginTop: "0.75rem" }}
              >
                <input
                  type="checkbox"
                  checked={form.requireInvoiceApproval}
                  onChange={(e) =>
                    setForm({ ...form, requireInvoiceApproval: e.target.checked })
                  }
                  style={{ marginTop: "0.2rem" }}
                />
                <span>
                  <strong style={{ fontWeight: 600 }}>Require invoice approval before send</strong>
                  <span className="muted" style={{ display: "block", fontSize: "0.85rem", marginTop: "0.2rem" }}>
                    When on, draft fee notes must be approved (Managing Partner or delegated
                    approver) before Mark sent. GL still posts on send only. Default on for pilot.
                  </span>
                </span>
              </label>
              <label
                className="settings-field"
                style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", marginTop: "0.75rem" }}
              >
                <input
                  type="checkbox"
                  checked={form.requireClearConflict}
                  onChange={(e) =>
                    setForm({ ...form, requireClearConflict: e.target.checked })
                  }
                  style={{ marginTop: "0.2rem" }}
                />
                <span>
                  <strong style={{ fontWeight: 600 }}>Require clear conflict check before open matter</strong>
                  <span className="muted" style={{ display: "block", fontSize: "0.85rem", marginTop: "0.2rem" }}>
                    When on, matter status Open needs a Clear conflict check on the client.
                    Prospective and draft remain allowed without Clear. Default on for pilot.
                  </span>
                </span>
              </label>
              <label
                className="settings-field"
                style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", marginTop: "0.75rem" }}
              >
                <input
                  type="checkbox"
                  checked={form.blockDisbursementIfTrustShort}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      blockDisbursementIfTrustShort: e.target.checked,
                    })
                  }
                  style={{ marginTop: "0.2rem" }}
                />
                <span>
                  <strong style={{ fontWeight: 600 }}>
                    Block disbursement pay when trust is short
                  </strong>
                  <span
                    className="muted"
                    style={{ display: "block", fontSize: "0.85rem", marginTop: "0.2rem" }}
                  >
                    When on, Finance cannot pay a disbursement requisition from firm float if
                    client trust is insufficient. When off (default), warn and allow firm float
                    as recoverable until the client tops up.
                  </span>
                </span>
              </label>
            </section>

            <section className="settings-section">
              <h3 className="settings-section-title">Contact & address</h3>
              <div className="settings-fields cols-2">
                <label className="settings-field">
                  <span>Contact email</span>
                  <input
                    className="input"
                    type="email"
                    value={form.contactEmail ?? ""}
                    onChange={set("contactEmail")}
                  />
                </label>
                <label className="settings-field">
                  <span>Contact phone</span>
                  <input
                    className="input"
                    value={form.contactPhone ?? ""}
                    onChange={set("contactPhone")}
                  />
                </label>
                <label className="settings-field">
                  <span>Address line 1</span>
                  <input
                    className="input"
                    value={form.addressLine1 ?? ""}
                    onChange={set("addressLine1")}
                  />
                </label>
                <label className="settings-field">
                  <span>Address line 2</span>
                  <input
                    className="input"
                    value={form.addressLine2 ?? ""}
                    onChange={set("addressLine2")}
                  />
                </label>
                <label className="settings-field">
                  <span>City</span>
                  <input className="input" value={form.city ?? ""} onChange={set("city")} />
                </label>
                <label className="settings-field">
                  <span>Country / locality</span>
                  <input className="input" value={form.country ?? ""} onChange={set("country")} />
                </label>
              </div>
            </section>

            <section className="settings-section">
              <h3 className="settings-section-title">Invoice letterhead</h3>
              <p className="settings-hint">
                Printed on PDF invoices for this firm only (Isolation keeps Isolation banking).
              </p>
              <div className="settings-fields">
                <label className="settings-field">
                  <span>Attorney / experience line (optional)</span>
                  <input
                    className="input"
                    value={form.invoiceAttorneyLine ?? ""}
                    onChange={set("invoiceAttorneyLine")}
                    placeholder="e.g. Ms. T Pfigu … years of experience"
                  />
                </label>
                <label className="settings-field">
                  <span>Payment note</span>
                  <textarea
                    className="input"
                    rows={3}
                    value={form.invoicePaymentNote ?? ""}
                    onChange={set("invoicePaymentNote")}
                    placeholder="Payment may be made in cash at the office or into the following Zimbabwe Nostro Bank Account."
                  />
                </label>
                <label className="settings-field">
                  <span>Closing line</span>
                  <input
                    className="input"
                    value={form.invoiceClosingNote ?? ""}
                    onChange={set("invoiceClosingNote")}
                    placeholder="Thank you for your business!!!"
                  />
                </label>
              </div>
            </section>

            <section className="settings-section">
              <h3 className="settings-section-title">Banking details (printed)</h3>
              <div className="settings-fields cols-2">
                <label className="settings-field">
                  <span>Account name</span>
                  <input
                    className="input"
                    value={form.invoiceBanking.accountName}
                    onChange={setBank("accountName")}
                  />
                </label>
                <label className="settings-field">
                  <span>Bank</span>
                  <input
                    className="input"
                    value={form.invoiceBanking.bank}
                    onChange={setBank("bank")}
                  />
                </label>
                <label className="settings-field">
                  <span>Account number</span>
                  <input
                    className="input"
                    value={form.invoiceBanking.accountNumber}
                    onChange={setBank("accountNumber")}
                  />
                </label>
                <label className="settings-field">
                  <span>Branch</span>
                  <input
                    className="input"
                    value={form.invoiceBanking.branch}
                    onChange={setBank("branch")}
                  />
                </label>
                <label className="settings-field">
                  <span>Account type</span>
                  <input
                    className="input"
                    value={form.invoiceBanking.accountType}
                    onChange={setBank("accountType")}
                    placeholder="NOSTRO"
                  />
                </label>
                <label className="settings-field">
                  <span>SWIFT code</span>
                  <input
                    className="input"
                    value={form.invoiceBanking.swiftCode}
                    onChange={setBank("swiftCode")}
                  />
                </label>
                <label className="settings-field">
                  <span>Branch code</span>
                  <input
                    className="input"
                    value={form.invoiceBanking.branchCode}
                    onChange={setBank("branchCode")}
                    placeholder="(021)"
                  />
                </label>
              </div>
            </section>

            <div className="settings-actions">
              <Button disabled={saving} onClick={() => void save()}>
                {saving ? "Saving…" : "Save firm profile"}
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </Can>
  );
}
