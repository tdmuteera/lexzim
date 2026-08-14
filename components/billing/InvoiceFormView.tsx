"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClientMatterPicker } from "@/components/finance/ClientMatterPicker";
import { ClientSearchPicker } from "@/components/finance/ClientSearchPicker";
import { FeeMoneyCallout } from "@/components/billing/FeeMoneyCallout";
import { Button } from "@/components/ui/Button";
import { centsToDisplay, dollarsToCents } from "@/lib/billing/money";
import {
  quotationDiscountCents,
  quotationSubtotalCents,
  quotationTotalCents,
} from "@/lib/quotes/totals";

type ServiceItem = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  defaultPriceCents: number;
  currency: string;
  isActive: boolean;
};

type DraftLine = {
  key: string;
  firmServiceId: string | null;
  description: string;
  qty: string;
  unitPriceDollars: string;
};

function newLine(partial?: Partial<DraftLine>): DraftLine {
  return {
    key: crypto.randomUUID(),
    firmServiceId: null,
    description: "",
    qty: "1",
    unitPriceDollars: "",
    ...partial,
  };
}

export function InvoiceFormView() {
  const router = useRouter();
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [clientId, setClientId] = useState("");
  const [matterId, setMatterId] = useState("");
  const [notes, setNotes] = useState("");
  const [discountMode, setDiscountMode] = useState<"none" | "amount" | "percent">("none");
  const [discountDollars, setDiscountDollars] = useState("");
  const [discountPct, setDiscountPct] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([newLine()]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/finance/services", { credentials: "include" });
        const body = (await res.json()) as {
          ok?: boolean;
          data?: { items?: ServiceItem[] };
        };
        if (!cancelled && res.ok && body.data?.items) {
          setServices(body.data.items.filter((s) => s.isActive));
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const lineTotals = useMemo(() => {
    return lines.map((line) => {
      const qty = Number(line.qty) || 0;
      const unitCents = dollarsToCents(line.unitPriceDollars) ?? 0;
      return Math.round(qty * unitCents);
    });
  }, [lines]);

  const subtotalCents = useMemo(
    () => quotationSubtotalCents(lineTotals.map((lineTotalCents) => ({ lineTotalCents }))),
    [lineTotals],
  );

  const discountCents = useMemo(() => {
    if (discountMode === "amount") return dollarsToCents(discountDollars) ?? 0;
    if (discountMode === "percent") {
      const pct = Number(discountPct);
      return quotationDiscountCents(subtotalCents, 0, Number.isFinite(pct) ? pct : 0);
    }
    return 0;
  }, [discountMode, discountDollars, discountPct, subtotalCents]);

  const totalCents = useMemo(() => {
    if (discountMode === "percent") {
      const pct = Number(discountPct);
      return quotationTotalCents(subtotalCents, 0, Number.isFinite(pct) ? pct : 0);
    }
    return quotationTotalCents(subtotalCents, discountCents, null);
  }, [discountMode, discountCents, discountPct, subtotalCents]);

  const currency = services[0]?.currency ?? "USD";

  const addFromService = useCallback((service: ServiceItem) => {
    setLines((prev) => [
      ...prev,
      newLine({
        firmServiceId: service.id,
        description: service.name,
        qty: "1",
        unitPriceDollars: (service.defaultPriceCents / 100).toFixed(2),
      }),
    ]);
  }, []);

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== key)));
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
      const payload: Record<string, unknown> = {
        clientId,
        matterId,
        notes: notes.trim() || null,
        lines: lines.map((line) => ({
          firmServiceId: line.firmServiceId,
          description: line.description.trim(),
          qty: Number(line.qty),
          unitPriceDollars: line.unitPriceDollars,
        })),
      };
      if (discountMode === "amount" && discountDollars) {
        payload.discountDollars = discountDollars;
      } else if (discountMode === "percent" && discountPct) {
        payload.discountPct = Number(discountPct);
      }

      const res = await fetch("/api/invoices", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { invoice?: { id: string } };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data?.invoice?.id) {
        setError(body.error?.message ?? "Could not create invoice.");
        return;
      }
      router.push(`/finance/invoicing/invoices/${body.data.invoice.id}`);
    } catch {
      setError("Could not create invoice.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="view active scrollable finance-desk-view" aria-label="New invoice">
      <div className="panel">
        <div className="panel-head">
          <div>
            <h1>New invoice</h1>
            <p className="muted">
              Create a fee note from the service catalogue. GL posts when you mark the invoice sent.
            </p>
          </div>
          <Link href="/finance/invoicing" className="btn btn-outline btn-sm">
            Back to invoicing
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
              required
            />
          </div>

          <div className="quote-catalogue">
            <h2>Service catalogue</h2>
            {loading ? <p className="muted">Loading services…</p> : null}
            {!loading && services.length === 0 ? (
              <p className="muted">No active services. Defaults seed on first access.</p>
            ) : null}
            <div className="quote-catalogue-list">
              {services.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="quote-catalogue-item"
                  onClick={() => addFromService(s)}
                  disabled={saving}
                >
                  <span className="code">{s.code}</span>
                  <span className="name">{s.name}</span>
                  <span className="price">{centsToDisplay(s.defaultPriceCents, s.currency)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="quote-lines">
            <h2>Line items</h2>
            <div className="table-wrap">
              <table className="data quote-lines-table">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th className="num">Qty</th>
                    <th className="num">Unit price</th>
                    <th className="num">Line total</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => (
                    <tr key={line.key}>
                      <td>
                        <input
                          type="text"
                          required
                          placeholder="Description"
                          value={line.description}
                          onChange={(e) => updateLine(line.key, { description: e.target.value })}
                          disabled={saving}
                        />
                      </td>
                      <td className="num">
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          required
                          value={line.qty}
                          onChange={(e) => updateLine(line.key, { qty: e.target.value })}
                          disabled={saving}
                        />
                      </td>
                      <td className="num">
                        <input
                          type="text"
                          inputMode="decimal"
                          required
                          placeholder="0.00"
                          value={line.unitPriceDollars}
                          onChange={(e) =>
                            updateLine(line.key, { unitPriceDollars: e.target.value })
                          }
                          disabled={saving}
                        />
                      </td>
                      <td className="num">
                        {centsToDisplay(lineTotals[idx] ?? 0, currency)}
                      </td>
                      <td>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => removeLine(line.key)}
                          disabled={saving || lines.length <= 1}
                        >
                          Remove
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setLines((prev) => [...prev, newLine()])}
              disabled={saving}
            >
              Add line
            </Button>
          </div>

          <div className="quote-form-grid">
            <label>
              <span className="muted">Discount</span>
              <select
                value={discountMode}
                onChange={(e) =>
                  setDiscountMode(e.target.value as "none" | "amount" | "percent")
                }
                disabled={saving}
              >
                <option value="none">None</option>
                <option value="amount">Fixed amount</option>
                <option value="percent">Percent</option>
              </select>
            </label>
            {discountMode === "amount" ? (
              <label>
                <span className="muted">Discount amount</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={discountDollars}
                  onChange={(e) => setDiscountDollars(e.target.value)}
                  disabled={saving}
                />
              </label>
            ) : null}
            {discountMode === "percent" ? (
              <label>
                <span className="muted">Discount %</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={discountPct}
                  onChange={(e) => setDiscountPct(e.target.value)}
                  disabled={saving}
                />
              </label>
            ) : null}
          </div>

          <label>
            <span className="muted">Notes (shown on invoice)</span>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={saving}
            />
          </label>

          <div className="quote-preview-card">
            <h2>Preview</h2>
            <dl className="quote-preview-totals">
              <div>
                <dt>Subtotal</dt>
                <dd>{centsToDisplay(subtotalCents, currency)}</dd>
              </div>
              {discountCents > 0 ? (
                <div>
                  <dt>Discount</dt>
                  <dd>{centsToDisplay(discountCents, currency)}</dd>
                </div>
              ) : null}
              <div className="total">
                <dt>Total</dt>
                <dd>{centsToDisplay(totalCents, currency)}</dd>
              </div>
            </dl>
          </div>

          <div className="form-actions">
            <Button type="submit" disabled={saving || !clientId || !matterId}>
              {saving ? "Saving…" : "Save draft invoice"}
            </Button>
          </div>
        </form>
        </div>
      </div>
    </section>
  );
}
