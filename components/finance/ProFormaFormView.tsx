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

const KIND_CARDS: Array<{ id: ProformaKind; title: string; copy: string }> = [
  {
    id: "conveyancing",
    title: "Conveyancing",
    copy: "Property transfer estimate with stamp duty and fee calculators.",
  },
  {
    id: "legal_fees",
    title: "Legal fees draft",
    copy: "Quotation-style fee note. Not counted as money owed.",
  },
];

const CATEGORY_COPY: Record<ConveyancingCategory, string> = {
  registered_title: "Title deed transfer. Stamp duty and registration apply.",
  cession: "Cession or under-developer rights. No stamp duty. Manual cession fee.",
  commercial: "Commercial property. Progressive stamp duty. Optional VAT 15.5%.",
};

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
  const [errorRef, setErrorRef] = useState<string | null>(null);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- value updates handled separately
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

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!clientId) {
      setError("Select a client.");
      setErrorRef(null);
      return;
    }
    setSaving(true);
    setError(null);
    setErrorRef(null);
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
        requestId?: string;
        data?: { proforma?: { id: string } };
        error?: { message: string; requestId?: string };
      };
      if (!res.ok || !body.ok || !body.data?.proforma?.id) {
        setError(body.error?.message ?? "Could not create pro forma.");
        setErrorRef(body.error?.requestId ?? body.requestId ?? null);
        return;
      }
      router.push(`/finance/proforma/${body.data.proforma.id}`);
    } catch {
      setError("Could not create pro forma. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  const faintOptional = lines.filter((l) => l.isOptional && !l.included);
  const visibleLines = lines.filter((l) => l.included || !l.isOptional);

  return (
    <section className="view active scrollable finance-desk-view proforma-page" aria-label="New pro forma">
      <div className="proforma-hero">
        <div>
          <h1>New pro forma</h1>
          <p className="lede">
            One form for legal-fees drafts and conveyancing estimates. Figures are prefilled from
            locked rules, then fully editable. Nothing posts to debtors or the ledger.
          </p>
          <div className="proforma-badge-row">
            <span className="proforma-pill">
              Stamp duty <strong>Finance Act bands</strong>
            </span>
            <span className="proforma-pill">
              Conveyancing <strong>{DEFAULT_CONVEYANCING_RATE_PCT}%</strong>
            </span>
            <span className="proforma-pill">
              VAT option <strong>{COMMERCIAL_VAT_RATE_PCT}%</strong>
            </span>
          </div>
        </div>
        <Link href="/finance/proforma" className="btn btn-outline btn-sm">
          Back to list
        </Link>
      </div>

      <FeeMoneyCallout />

      {error ? (
        <p role="alert" style={{ color: "var(--danger)", margin: 0 }}>
          {error}
          {errorRef ? (
            <span className="muted" style={{ display: "block", marginTop: "0.25rem" }}>
              Reference: {errorRef}
            </span>
          ) : null}
        </p>
      ) : null}

      <form className="quote-form" onSubmit={onSubmit}>
        <div className="proforma-section">
          <h2>1. Pro forma type</h2>
          <p className="section-help">Choose the document kind first. This switches the fee template.</p>
          <div className="proforma-choice-grid">
            {KIND_CARDS.map((card) => (
              <button
                key={card.id}
                type="button"
                className={["proforma-choice", kind === card.id ? "active" : ""].filter(Boolean).join(" ")}
                onClick={() => setKind(card.id)}
                disabled={saving}
              >
                <span className="choice-title">{card.title}</span>
                <span className="choice-copy">{card.copy}</span>
              </button>
            ))}
          </div>
        </div>

        {kind === "conveyancing" ? (
          <div className="proforma-section">
            <h2>2. Property category</h2>
            <p className="section-help">
              Registered title, cession (includes under-developer), or commercial.
            </p>
            <div className="proforma-choice-grid">
              {CONVEYANCING_CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={["proforma-choice", category === c ? "active" : ""].filter(Boolean).join(" ")}
                  onClick={() => setCategory(c)}
                  disabled={saving}
                >
                  <span className="choice-title">{conveyancingCategoryLabel(c)}</span>
                  <span className="choice-copy">{CATEGORY_COPY[c]}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="proforma-section">
          <h2>{kind === "conveyancing" ? "3. Client and property" : "2. Client"}</h2>
          <p className="section-help">
            Link the estimate to a client. Property value drives stamp duty and percentage fees.
          </p>
          <div className="quote-form-grid">
            <ClientSearchPicker
              value={clientId}
              onChange={(id) => {
                setClientId(id);
                setMatterId("");
              }}
              disabled={saving}
            />
            <ClientMatterPicker
              clientId={clientId}
              value={matterId}
              onChange={(id) => setMatterId(id)}
              disabled={saving}
            />
            {kind === "conveyancing" ? (
              <label>
                <span className="muted">Property value (USD)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={propertyValue}
                  onChange={(e) => setPropertyValue(e.target.value)}
                  placeholder="e.g. 50000"
                  required
                  disabled={saving}
                />
              </label>
            ) : null}
          </div>
        </div>

        <div className="proforma-section">
          <h2>{kind === "conveyancing" ? "4. Fee lines" : "3. Fee lines"}</h2>
          <p className="section-help">
            Prefills update when you change category or property value. Edit any amount, or add
            optional lines with +.
          </p>
          <div className="table-wrap">
            <table className="data quote-lines-table proforma-lines-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th className="num">Qty</th>
                  <th className="num">Rate %</th>
                  <th className="num">Amount</th>
                  <th className="num">Line total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visibleLines.map((line) => (
                  <tr key={line.key}>
                    <td>
                      <input
                        value={line.description}
                        onChange={(e) => updateLine(line.key, { description: e.target.value })}
                        required={line.included}
                        disabled={saving}
                      />
                      {line.calcHint ? <div className="hint">{line.calcHint}</div> : null}
                    </td>
                    <td className="num">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={line.qty}
                        onChange={(e) => updateLine(line.key, { qty: Number(e.target.value) || 0 })}
                        disabled={saving}
                      />
                    </td>
                    <td className="num">
                      {line.ratePct != null ? (
                        <input
                          type="number"
                          min={0}
                          step="0.1"
                          value={line.ratePct}
                          onChange={(e) => updateLine(line.key, { ratePct: e.target.value })}
                          disabled={saving}
                        />
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="num">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={line.unitPriceDollars}
                        onChange={(e) => updateLine(line.key, { unitPriceDollars: e.target.value })}
                        disabled={saving}
                        placeholder="0.00"
                      />
                    </td>
                    <td className="num">{centsToDisplay(draftLineTotalCents(line))}</td>
                    <td>
                      {line.isOptional && line.included ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => updateLine(line.key, { included: false })}
                          disabled={saving}
                        >
                          Hide
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {faintOptional.length ? (
            <div className="proforma-optional-row">
              {faintOptional.map((line) => (
                <button
                  key={line.key}
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => updateLine(line.key, { included: true })}
                  disabled={saving}
                >
                  + {line.description || line.lineCode}
                </button>
              ))}
            </div>
          ) : null}

          <div style={{ marginTop: "0.85rem" }}>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setLines((p) => [...p, newCustomLine()])}
              disabled={saving}
            >
              + Add custom fee
            </Button>
          </div>
        </div>

        <div className="proforma-section">
          <h2>Notes</h2>
          <label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Optional notes for the client or file"
              disabled={saving}
            />
          </label>
        </div>

        <div className="proforma-footer-bar">
          <div>
            <div className="total-label">Total (included lines)</div>
            <div className="total-value">{centsToDisplay(totalCents)}</div>
          </div>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save pro forma"}
          </Button>
        </div>
      </form>
    </section>
  );
}
