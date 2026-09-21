"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClientMatterPicker } from "@/components/finance/ClientMatterPicker";
import { ClientSearchPicker } from "@/components/finance/ClientSearchPicker";
import { FeeMoneyCallout } from "@/components/billing/FeeMoneyCallout";
import { Button } from "@/components/ui/Button";
import { centsToDisplay } from "@/lib/billing/money";
import {
  buildConveyancingLines,
  buildLegalFeesStarterLines,
  draftLineTotalCents,
  type ProformaDraftLine,
} from "@/lib/proforma/defaults";
import { calculateStampDutyDollars, stampDutyBandLabel } from "@/lib/proforma/stamp-duty";
import {
  COMMERCIAL_VAT_RATE_PCT,
  CONVEYANCING_CATEGORIES,
  conveyancingCategoryLabel,
  DEFAULT_CONVEYANCING_RATE_PCT,
  PROFORMA_KINDS,
  proformaKindLabel,
  type ConveyancingCategory,
  type ProformaKind,
} from "@/lib/proforma/types";

function newCustomLine(): ProformaDraftLine {
  return {
    key: crypto.randomUUID(),
    lineCode: "custom",
    description: "Other fees",
    included: true,
    isOptional: true,
    qty: 1,
    unitPriceDollars: "",
    ratePct: null,
    calcHint: null,
  };
}

export function ProFormaFormView() {
  const router = useRouter();
  const [kind, setKind] = useState<ProformaKind>("conveyancing");
  const [category, setCategory] = useState<ConveyancingCategory>("registered_title");
  const [clientId, setClientId] = useState("");
  const [matterId, setMatterId] = useState("");
  const [propertyValue, setPropertyValue] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<ProformaDraftLine[]>(() =>
    buildConveyancingLines({ category: "registered_title", propertyValueDollars: 0 }),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const propertyValueDollars = useMemo(() => {
    const n = Number(String(propertyValue).replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  }, [propertyValue]);

  const rebuildConveyancing = useCallback(
    (nextCategory: ConveyancingCategory, valueDollars: number) => {
      setLines(buildConveyancingLines({ category: nextCategory, propertyValueDollars: valueDollars }));
    },
    [],
  );

  useEffect(() => {
    if (kind === "legal_fees") {
      setLines(buildLegalFeesStarterLines());
      return;
    }
    rebuildConveyancing(category, propertyValueDollars);
    // Category / kind changes reset templates. Property value updates amounts in place below.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: do not rebuild on every value keystroke
  }, [kind, category, rebuildConveyancing]);

  useEffect(() => {
    if (kind !== "conveyancing") return;
    setLines((prev) =>
      prev.map((line) => {
        if (line.lineCode === "stamp_duty") {
          return {
            ...line,
            unitPriceDollars: calculateStampDutyDollars(propertyValueDollars).toFixed(2),
            calcHint:
              propertyValueDollars > 0
                ? stampDutyBandLabel(propertyValueDollars)
                : "Finance Act progressive bands",
          };
        }
        if (line.lineCode === "conveyancing_fee") {
          const pct = Number(line.ratePct ?? DEFAULT_CONVEYANCING_RATE_PCT);
          const rate = Number.isFinite(pct) ? pct : DEFAULT_CONVEYANCING_RATE_PCT;
          return {
            ...line,
            unitPriceDollars: ((propertyValueDollars * rate) / 100).toFixed(2),
            calcHint: `${rate}% of property value (editable)`,
          };
        }
        if (line.lineCode === "vat") {
          const pct = Number(line.ratePct ?? COMMERCIAL_VAT_RATE_PCT);
          const rate = Number.isFinite(pct) ? pct : COMMERCIAL_VAT_RATE_PCT;
          return {
            ...line,
            unitPriceDollars: ((propertyValueDollars * rate) / 100).toFixed(2),
          };
        }
        return line;
      }),
    );
  }, [kind, propertyValueDollars]);

  const totalCents = useMemo(
    () => lines.reduce((sum, line) => sum + draftLineTotalCents(line), 0),
    [lines],
  );

  function updateLine(key: string, patch: Partial<ProformaDraftLine>) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l, ...patch };
        if (
          patch.ratePct != null &&
          (l.lineCode === "conveyancing_fee" || l.lineCode === "vat") &&
          propertyValueDollars > 0
        ) {
          const pct = Number(patch.ratePct);
          if (Number.isFinite(pct)) {
            next.unitPriceDollars = ((propertyValueDollars * pct) / 100).toFixed(2);
          }
        }
        return next;
      }),
    );
  }

  function includeOptional(key: string) {
    updateLine(key, { included: true });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!clientId) {
      setError("Select a client.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        kind,
        conveyancingCategory: kind === "conveyancing" ? category : null,
        clientId,
        matterId: matterId || null,
        propertyValueDollars: kind === "conveyancing" ? propertyValue : null,
        notes: notes.trim() || null,
        lines: lines.map((line) => ({
          lineCode: line.lineCode,
          description: line.description,
          included: line.included,
          isOptional: line.isOptional,
          qty: line.qty,
          unitPriceDollars: line.unitPriceDollars || "0",
          ratePct: line.ratePct,
          calcHint: line.calcHint,
        })),
      };
      const res = await fetch("/api/finance/proformas", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { proforma?: { id: string } };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data?.proforma?.id) {
        setError(body.error?.message ?? "Could not create pro forma.");
        return;
      }
      router.push(`/finance/proforma/${body.data.proforma.id}`);
    } catch {
      setError("Could not create pro forma.");
    } finally {
      setSaving(false);
    }
  }

  const faintOptional = lines.filter((l) => l.isOptional && !l.included);
  const visibleLines = lines.filter((l) => l.included || !l.isOptional);

  return (
    <section className="view active scrollable finance-desk-view" aria-label="New pro forma">
      <div className="panel">
        <div className="panel-head">
          <div>
            <h1>New pro forma</h1>
            <p className="muted">
              One form for legal-fees drafts and conveyancing estimates. Prefills are editable.
              Nothing posts to accounting until converted later.
            </p>
          </div>
          <Link href="/finance/proforma" className="btn btn-outline btn-sm">
            Back to list
          </Link>
        </div>

        <div className="panel-body">
          <FeeMoneyCallout />

          {error ? (
            <p role="alert" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          ) : null}

          <form className="quote-form" onSubmit={onSubmit}>
            <div className="quote-form-grid">
              <label>
                Pro forma type
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as ProformaKind)}
                  required
                >
                  {PROFORMA_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {proformaKindLabel(k)}
                    </option>
                  ))}
                </select>
              </label>

              {kind === "conveyancing" ? (
                <label>
                  Property category
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as ConveyancingCategory)}
                    required
                  >
                    {CONVEYANCING_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {conveyancingCategoryLabel(c)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <ClientSearchPicker
                value={clientId}
                onChange={(id) => {
                  setClientId(id);
                  setMatterId("");
                }}
              />
              <ClientMatterPicker clientId={clientId} value={matterId} onChange={setMatterId} />

              {kind === "conveyancing" ? (
                <label>
                  Property value (USD)
                  <input
                    type="text"
                    inputMode="decimal"
                    value={propertyValue}
                    onChange={(e) => setPropertyValue(e.target.value)}
                    placeholder="e.g. 50000"
                    required
                  />
                </label>
              ) : null}
            </div>

            {kind === "conveyancing" ? (
              <p className="muted" style={{ marginTop: "0.75rem" }}>
                Stamp duty uses Finance Act progressive bands. Default conveyancing rate{" "}
                {DEFAULT_CONVEYANCING_RATE_PCT}%. VAT option uses {COMMERCIAL_VAT_RATE_PCT}%.
                Changing type, category, or property value rebuilds prefilled lines.
              </p>
            ) : (
              <p className="muted" style={{ marginTop: "0.75rem" }}>
                Legal fees pro forma follows a normal invoice line layout. Draft only.
              </p>
            )}

            <div className="quote-lines" style={{ marginTop: "1rem" }}>
              <table className="quote-lines-table">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th style={{ width: "5rem" }}>Qty</th>
                    <th style={{ width: "6rem" }}>Rate %</th>
                    <th style={{ width: "8rem" }}>Amount</th>
                    <th style={{ width: "7rem" }}>Line total</th>
                    <th style={{ width: "4rem" }} />
                  </tr>
                </thead>
                <tbody>
                  {visibleLines.map((line) => {
                    const faint = line.isOptional && !line.included;
                    return (
                      <tr
                        key={line.key}
                        style={faint ? { opacity: 0.45 } : undefined}
                      >
                        <td>
                          <input
                            value={line.description}
                            onChange={(e) => updateLine(line.key, { description: e.target.value })}
                            disabled={faint}
                            required={line.included}
                          />
                          {line.calcHint ? (
                            <div className="muted" style={{ fontSize: "0.8rem" }}>
                              {line.calcHint}
                            </div>
                          ) : null}
                        </td>
                        <td>
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={line.qty}
                            onChange={(e) =>
                              updateLine(line.key, { qty: Number(e.target.value) || 0 })
                            }
                            disabled={faint}
                          />
                        </td>
                        <td>
                          {line.ratePct != null ? (
                            <input
                              type="number"
                              min={0}
                              step="0.1"
                              value={line.ratePct}
                              onChange={(e) => updateLine(line.key, { ratePct: e.target.value })}
                              disabled={faint}
                            />
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={line.unitPriceDollars}
                            onChange={(e) =>
                              updateLine(line.key, { unitPriceDollars: e.target.value })
                            }
                            disabled={faint}
                            placeholder="0.00"
                          />
                        </td>
                        <td>{centsToDisplay(draftLineTotalCents(line))}</td>
                        <td>
                          {line.isOptional && line.included ? (
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              onClick={() => updateLine(line.key, { included: false })}
                            >
                              Hide
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {faintOptional.length ? (
              <div style={{ marginTop: "0.75rem", display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                {faintOptional.map((line) => (
                  <button
                    key={line.key}
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => includeOptional(line.key)}
                  >
                    + {line.description || line.lineCode}
                  </button>
                ))}
              </div>
            ) : null}

            <div style={{ marginTop: "0.75rem" }}>
              <Button type="button" variant="outline" onClick={() => setLines((p) => [...p, newCustomLine()])}>
                + Add custom fee
              </Button>
            </div>

            <label style={{ display: "block", marginTop: "1rem" }}>
              Notes
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Optional notes for the client or file"
              />
            </label>

            <div
              style={{
                marginTop: "1rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "1rem",
                flexWrap: "wrap",
              }}
            >
              <strong>Total (included lines): {centsToDisplay(totalCents)}</strong>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save pro forma"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
