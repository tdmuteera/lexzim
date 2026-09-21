"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Can } from "@/components/auth/Can";
import { FeeMoneyCallout } from "@/components/billing/FeeMoneyCallout";
import { Badge } from "@/components/ui/Badge";
import { centsToDisplay } from "@/lib/billing/money";

type Detail = {
  id: string;
  proformaNumber: string;
  kindLabel: string;
  conveyancingCategoryLabel: string | null;
  statusLabel: string;
  status: string;
  currency: string;
  clientDisplayLabel: string;
  matterTitle: string | null;
  matterNumber: string | null;
  propertyValueCents: number | null;
  subject: string | null;
  notes: string | null;
  totalCents: number;
  firmIncomeCents: number;
  clientCollectibleCents: number;
  createdAt: string;
  lines: Array<{
    id: string;
    description: string;
    moneyClass: string;
    moneyClassLabel: string;
    included: boolean;
    qty: number;
    unitPriceCents: number;
    lineTotalCents: number;
    ratePct: number | null;
    calcHint: string | null;
  }>;
};

export function ProFormaDetailView() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [item, setItem] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/finance/proformas/${id}`, { credentials: "include" });
        const body = (await res.json()) as {
          ok: boolean;
          requestId?: string;
          data?: { proforma: Detail };
          error?: { message: string; requestId?: string };
        };
        if (cancelled) return;
        if (!res.ok || !body.ok || !body.data?.proforma) {
          setError(
            body.error?.message ??
              `Could not load pro forma.${body.error?.requestId || body.requestId ? ` Reference: ${body.error?.requestId ?? body.requestId}` : ""}`,
          );
          setItem(null);
          return;
        }
        setItem(body.data.proforma);
        setError(null);
      } catch {
        if (!cancelled) setError("Could not load pro forma.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <section className="view active scrollable finance-desk-view proforma-page" aria-label="Pro forma detail">
      <div className="proforma-hero">
        <div>
          <h1>{item?.proformaNumber ?? "Pro forma"}</h1>
          <p className="lede">
            Estimate only. Firm fees are expected earnings; collectibles are amounts to gather and
            pay onward. Not posted to debtors or the general ledger.
          </p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", justifyContent: "flex-end" }}>
          <Link href="/finance/proforma" className="btn btn-outline btn-sm">
            Back to list
          </Link>
          {item && item.status !== "void" ? (
            <Can permissions={["finance.quote.manage", "billing.manage"]} mode="any">
              <Link href={`/finance/proforma/${item.id}/edit`} className="btn btn-outline btn-sm">
                Edit
              </Link>
            </Can>
          ) : null}
          {item ? (
            <>
              <a
                className="btn btn-primary btn-sm"
                href={`/api/finance/proformas/${item.id}/export?format=pdf`}
              >
                Download PDF
              </a>
              <a
                className="btn btn-outline btn-sm"
                href={`/api/finance/proformas/${item.id}/export?format=docx`}
              >
                Download Word
              </a>
            </>
          ) : null}
        </div>
      </div>

      <FeeMoneyCallout />
      {loading ? <p className="muted">Loading…</p> : null}
      {error ? (
        <p role="alert" style={{ color: "var(--danger)", margin: 0 }}>
          {error}
        </p>
      ) : null}

      {item ? (
        <>
          <div className="proforma-section">
            <div className="proforma-meta-grid">
              <div>
                <div className="meta-label">Type</div>
                <div className="meta-value">{item.kindLabel}</div>
              </div>
              <div>
                <div className="meta-label">Category</div>
                <div className="meta-value">{item.conveyancingCategoryLabel ?? "—"}</div>
              </div>
              <div>
                <div className="meta-label">Client</div>
                <div className="meta-value">{item.clientDisplayLabel}</div>
              </div>
              <div>
                <div className="meta-label">Matter</div>
                <div className="meta-value">
                  {item.matterNumber
                    ? `${item.matterNumber}${item.matterTitle ? ` · ${item.matterTitle}` : ""}`
                    : "—"}
                </div>
              </div>
              <div>
                <div className="meta-label">Status</div>
                <Badge tone={item.status === "void" ? "closed" : "pending"}>
                  {item.statusLabel}
                </Badge>
              </div>
              <div>
                <div className="meta-label">Property value</div>
                <div className="meta-value">
                  {item.propertyValueCents != null
                    ? centsToDisplay(item.propertyValueCents, item.currency)
                    : "—"}
                </div>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <div className="meta-label">Subject</div>
                <div className="meta-value">{item.subject ?? "—"}</div>
              </div>
            </div>
          </div>

          <div className="proforma-section">
            <h2>Firm fees (earnings)</h2>
            <div className="table-wrap" style={{ marginTop: "0.75rem" }}>
              <table className="data quote-lines-table proforma-lines-table">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th className="num">Qty</th>
                    <th className="num">Rate %</th>
                    <th className="num">Amount</th>
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {item.lines
                    .filter((l) => l.included && l.moneyClass === "firm_income")
                    .map((line) => (
                      <tr key={line.id}>
                        <td>
                          {line.description}
                          {line.calcHint ? <div className="hint">{line.calcHint}</div> : null}
                        </td>
                        <td className="num">{line.qty}</td>
                        <td className="num">{line.ratePct != null ? line.ratePct : "—"}</td>
                        <td className="num">
                          {centsToDisplay(line.unitPriceCents, item.currency)}
                        </td>
                        <td className="num">
                          {centsToDisplay(line.lineTotalCents, item.currency)}
                        </td>
                      </tr>
                    ))}
                  {!item.lines.some((l) => l.included && l.moneyClass === "firm_income") ? (
                    <tr>
                      <td colSpan={5} className="muted">
                        No firm fee lines
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <p className="muted" style={{ marginTop: "0.5rem" }}>
              Subtotal: {centsToDisplay(item.firmIncomeCents, item.currency)}
            </p>
          </div>

          <div className="proforma-section">
            <h2>Collectibles (pay onward)</h2>
            <div className="table-wrap" style={{ marginTop: "0.75rem" }}>
              <table className="data quote-lines-table proforma-lines-table">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th className="num">Qty</th>
                    <th className="num">Rate %</th>
                    <th className="num">Amount</th>
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {item.lines
                    .filter((l) => l.included && l.moneyClass !== "firm_income")
                    .map((line) => (
                      <tr key={line.id}>
                        <td>
                          {line.description}
                          {line.calcHint ? <div className="hint">{line.calcHint}</div> : null}
                        </td>
                        <td className="num">{line.qty}</td>
                        <td className="num">{line.ratePct != null ? line.ratePct : "—"}</td>
                        <td className="num">
                          {centsToDisplay(line.unitPriceCents, item.currency)}
                        </td>
                        <td className="num">
                          {centsToDisplay(line.lineTotalCents, item.currency)}
                        </td>
                      </tr>
                    ))}
                  {!item.lines.some((l) => l.included && l.moneyClass !== "firm_income") ? (
                    <tr>
                      <td colSpan={5} className="muted">
                        No collectible lines
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <p className="muted" style={{ marginTop: "0.5rem" }}>
              Subtotal: {centsToDisplay(item.clientCollectibleCents, item.currency)}
            </p>
          </div>

          <div className="proforma-footer-bar">
            <div>
              <div className="total-label">Firm fees</div>
              <div className="meta-value">
                {centsToDisplay(item.firmIncomeCents, item.currency)}
              </div>
              <div className="total-label" style={{ marginTop: "0.35rem" }}>
                Collectibles
              </div>
              <div className="meta-value">
                {centsToDisplay(item.clientCollectibleCents, item.currency)}
              </div>
              <div className="total-label" style={{ marginTop: "0.5rem" }}>
                Grand total
              </div>
              <div className="total-value">
                {centsToDisplay(item.totalCents, item.currency)}
              </div>
            </div>
          </div>

          {item.notes ? (
            <div className="proforma-section">
              <h2>Notes</h2>
              <p className="muted" style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                {item.notes}
              </p>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
