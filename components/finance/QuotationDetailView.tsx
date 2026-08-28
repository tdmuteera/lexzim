"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Can } from "@/components/auth/Can";
import { ExportMenu } from "@/components/export/ExportMenu";
import { SendDocumentButton } from "@/components/email/SendDocumentButton";
import { ClientMatterPicker } from "@/components/finance/ClientMatterPicker";
import { FeeMoneyCallout } from "@/components/billing/FeeMoneyCallout";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { invoiceDetailPath } from "@/lib/billing/paths";

type QuotationLine = {
  id: string;
  description: string;
  qty: number;
  unitPriceDisplay: string;
  lineTotalDisplay: string;
};

type Quotation = {
  id: string;
  quoteNumber: string;
  status: string;
  statusLabel: string;
  currency: string;
  clientId: string;
  clientNumber: string;
  clientDisplayLabel: string;
  clientEmail?: string | null;
  matterId: string | null;
  matterTitle: string | null;
  matterNumber: string | null;
  validUntil: string | null;
  notes: string | null;
  subtotalDisplay: string;
  discountDisplay: string;
  totalDisplay: string;
  discountAppliedCents: number;
  lines: QuotationLine[];
  createdAt: string;
};

function statusTone(status: string) {
  if (status === "accepted") return "open" as const;
  if (status === "declined" || status === "expired") return "closed" as const;
  if (status === "sent") return "default" as const;
  return "pending" as const;
}

function formatShortDate(value: string | null) {
  if (!value) return "n/a";
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function QuotationDetailView({ quotationId }: { quotationId: string }) {
  const router = useRouter();
  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [convertMatterId, setConvertMatterId] = useState("");
  const [convertOpen, setConvertOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/finance/quotations/${quotationId}`, {
        credentials: "include",
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { quotation: Quotation };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data?.quotation) {
        setError(body.error?.message ?? "Could not load quotation.");
        setQuotation(null);
        return;
      }
      setQuotation(body.data.quotation);
      if (body.data.quotation.matterId) {
        setConvertMatterId(body.data.quotation.matterId);
      }
    } catch {
      setError("Could not load quotation.");
      setQuotation(null);
    } finally {
      setLoading(false);
    }
  }, [quotationId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function setStatus(status: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/finance/quotations/${quotationId}/status`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not update status.");
        return;
      }
      await load();
    } catch {
      setError("Could not update status.");
    } finally {
      setBusy(false);
    }
  }

  async function convertToInvoice() {
    setBusy(true);
    setError(null);
    try {
      const matterId = convertMatterId || quotation?.matterId || undefined;
      const res = await fetch(`/api/finance/quotations/${quotationId}/convert`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(matterId ? { matterId } : {}),
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { invoice?: { id: string; href: string } };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data?.invoice?.id) {
        setError(body.error?.message ?? "Could not convert to invoice.");
        return;
      }
      router.push(body.data.invoice.href ?? invoiceDetailPath(body.data.invoice.id));
    } catch {
      setError("Could not convert to invoice.");
    } finally {
      setBusy(false);
      setConvertOpen(false);
    }
  }

  if (loading && !quotation) {
    return (
      <section className="view active scrollable">
        <p className="muted">Loading quotation…</p>
      </section>
    );
  }

  if (!quotation) {
    return (
      <section className="view active scrollable">
        <p role="alert" style={{ color: "var(--danger)" }}>
          {error ?? "Quotation not found."}
        </p>
        <Link href="/finance/quotations" className="btn btn-outline btn-sm">
          Back to quotations
        </Link>
      </section>
    );
  }

  const canConvert = quotation.status === "sent" || quotation.status === "accepted";
  const needsMatterForConvert = !quotation.matterId && !convertMatterId;

  return (
    <section className="view active scrollable finance-desk-view" aria-label="Quotation detail">
      <div className="panel">
        <div className="panel-head">
          <div>
            <p className="muted">
              <Link href="/finance/quotations">Quotations</Link>
            </p>
            <h1>{quotation.quoteNumber}</h1>
            <div className="inline-badges">
              <Badge tone={statusTone(quotation.status)}>{quotation.statusLabel}</Badge>
            </div>
          </div>
          <div className="panel-actions">
            <ExportMenu
              kind="quotation"
              queryParams={{ id: quotationId }}
              formats={["pdf", "docx", "xlsx"]}
              disabled={loading}
            />
            <Can permission="billing.view">
              <SendDocumentButton
                kind="quotation"
                id={quotationId}
                disabled={loading}
                defaultEmail={quotation.clientEmail}
                documentLabel={`Quotation ${quotation.quoteNumber}`}
              />
            </Can>
            <Can permission="finance.quote.manage">
              {quotation.status === "draft" ? (
                <Button size="sm" disabled={busy} onClick={() => void setStatus("sent")}>
                  Mark sent
                </Button>
              ) : null}
              {quotation.status === "sent" ? (
                <>
                  <Button size="sm" disabled={busy} onClick={() => void setStatus("accepted")}>
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void setStatus("declined")}
                  >
                    Decline
                  </Button>
                </>
              ) : null}
              {canConvert ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setConvertOpen((v) => !v)}
                >
                  Convert to invoice
                </Button>
              ) : null}
            </Can>
          </div>
        </div>

        <FeeMoneyCallout />

        {error ? (
          <p role="alert" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        ) : null}

        {convertOpen ? (
          <div className="quote-convert-panel">
            <h2>Convert to invoice</h2>
            <p className="muted">
              Creates a draft fee note with quote lines and discount. GL posting happens when the
              invoice is sent (P7-06).
            </p>
            {!quotation.matterId ? (
              <ClientMatterPicker
                clientId={quotation.clientId}
                value={convertMatterId}
                onChange={(id) => setConvertMatterId(id)}
                disabled={busy}
              />
            ) : (
              <p>
                Matter:{" "}
                {[quotation.matterNumber, quotation.matterTitle].filter(Boolean).join(" · ")}
              </p>
            )}
            <div className="form-actions">
              <Button
                size="sm"
                disabled={busy || needsMatterForConvert}
                onClick={() => void convertToInvoice()}
              >
                {busy ? "Converting…" : "Create draft invoice"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConvertOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        <div className="quote-document-preview">
          <header className="quote-document-header">
            <div>
              <p className="quote-doc-label">Quotation</p>
              <h2>{quotation.quoteNumber}</h2>
            </div>
            <div className="quote-doc-meta">
              <p>
                <span className="muted">Valid until</span> {formatShortDate(quotation.validUntil)}
              </p>
              <p>
                <span className="muted">Created</span> {formatShortDate(quotation.createdAt)}
              </p>
            </div>
          </header>

          <div className="quote-document-parties">
            <div>
              <p className="muted">Client</p>
              <p>
                <strong>{quotation.clientDisplayLabel}</strong>
              </p>
              <p className="muted">{quotation.clientNumber}</p>
            </div>
            {quotation.matterTitle || quotation.matterNumber ? (
              <div>
                <p className="muted">Matter</p>
                <p>
                  {[quotation.matterNumber, quotation.matterTitle].filter(Boolean).join(" · ")}
                </p>
              </div>
            ) : null}
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th className="num">Qty</th>
                  <th className="num">Unit</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {quotation.lines.map((line) => (
                  <tr key={line.id}>
                    <td>{line.description}</td>
                    <td className="num">{line.qty}</td>
                    <td className="num">{line.unitPriceDisplay}</td>
                    <td className="num">{line.lineTotalDisplay}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <dl className="quote-preview-totals">
            <div>
              <dt>Subtotal</dt>
              <dd>{quotation.subtotalDisplay}</dd>
            </div>
            {quotation.discountAppliedCents > 0 ? (
              <div>
                <dt>Discount</dt>
                <dd>{quotation.discountDisplay}</dd>
              </div>
            ) : null}
            <div className="total">
              <dt>Total</dt>
              <dd>{quotation.totalDisplay}</dd>
            </div>
          </dl>

          {quotation.notes ? (
            <div className="quote-document-notes">
              <p className="muted">Notes</p>
              <p>{quotation.notes}</p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
