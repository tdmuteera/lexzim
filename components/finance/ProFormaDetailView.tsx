"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
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
  notes: string | null;
  totalCents: number;
  createdAt: string;
  lines: Array<{
    id: string;
    description: string;
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
          data?: { proforma: Detail };
          error?: { message: string };
        };
        if (cancelled) return;
        if (!res.ok || !body.ok || !body.data?.proforma) {
          setError(body.error?.message ?? "Could not load pro forma.");
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
    <section className="view active scrollable finance-desk-view" aria-label="Pro forma detail">
      <div className="panel">
        <div className="panel-head">
          <div>
            <h1>{item?.proformaNumber ?? "Pro forma"}</h1>
            <p className="muted">Estimate only. Not posted to debtors or the general ledger.</p>
          </div>
          <Link href="/finance/proforma" className="btn btn-outline btn-sm">
            Back to list
          </Link>
        </div>
        <div className="panel-body">
          <FeeMoneyCallout />
          {loading ? <p className="muted">Loading…</p> : null}
          {error ? (
            <p role="alert" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          ) : null}
          {item ? (
            <>
              <div className="quote-form-grid">
                <div>
                  <div className="muted">Type</div>
                  <div>{item.kindLabel}</div>
                </div>
                <div>
                  <div className="muted">Category</div>
                  <div>{item.conveyancingCategoryLabel ?? "—"}</div>
                </div>
                <div>
                  <div className="muted">Client</div>
                  <div>{item.clientDisplayLabel}</div>
                </div>
                <div>
                  <div className="muted">Matter</div>
                  <div>
                    {item.matterNumber
                      ? `${item.matterNumber}${item.matterTitle ? ` · ${item.matterTitle}` : ""}`
                      : "—"}
                  </div>
                </div>
                <div>
                  <div className="muted">Status</div>
                  <Badge tone={item.status === "void" ? "closed" : "pending"}>
                    {item.statusLabel}
                  </Badge>
                </div>
                <div>
                  <div className="muted">Property value</div>
                  <div>
                    {item.propertyValueCents != null
                      ? centsToDisplay(item.propertyValueCents, item.currency)
                      : "—"}
                  </div>
                </div>
              </div>

              <table className="quote-lines-table" style={{ marginTop: "1rem" }}>
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>Qty</th>
                    <th>Rate %</th>
                    <th>Amount</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {item.lines
                    .filter((l) => l.included)
                    .map((line) => (
                      <tr key={line.id}>
                        <td>
                          {line.description}
                          {line.calcHint ? (
                            <div className="muted" style={{ fontSize: "0.8rem" }}>
                              {line.calcHint}
                            </div>
                          ) : null}
                        </td>
                        <td>{line.qty}</td>
                        <td>{line.ratePct != null ? line.ratePct : "—"}</td>
                        <td>{centsToDisplay(line.unitPriceCents, item.currency)}</td>
                        <td>{centsToDisplay(line.lineTotalCents, item.currency)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>

              <p style={{ marginTop: "1rem" }}>
                <strong>Total: {centsToDisplay(item.totalCents, item.currency)}</strong>
              </p>
              {item.notes ? (
                <p className="muted" style={{ marginTop: "0.75rem", whiteSpace: "pre-wrap" }}>
                  {item.notes}
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
