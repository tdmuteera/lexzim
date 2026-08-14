"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Can } from "@/components/auth/Can";
import { ExportMenu } from "@/components/export/ExportMenu";
import { FirmMoneyCallout } from "@/components/finance/FirmMoneyCallout";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { centsToDisplay } from "@/lib/billing/money";

type FloatRow = {
  id: string;
  openingDate: string;
  amountCents: number;
  currency: string;
  status: string;
};

type MovementRow = {
  id: string;
  movementType: string;
  amountCents: number;
  currency: string;
  movementDate: string;
  reference: string | null;
  notes: string | null;
};

type GlOption = { code: string; label: string; glAccountId: string | null };

const MOVEMENT_LABELS: Record<string, string> = {
  vault_to_petty: "Vault to petty",
  petty_spend: "Petty spend",
  petty_return: "Return to vault",
};

function todayInput() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function PettyCashView() {
  const [float, setFloat] = useState<FloatRow | null>(null);
  const [balanceCents, setBalanceCents] = useState(0);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [glOptions, setGlOptions] = useState<GlOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [openFloatOpen, setOpenFloatOpen] = useState(false);
  const [openingDate, setOpeningDate] = useState(todayInput);
  const [openingAmount, setOpeningAmount] = useState("");

  const [moveOpen, setMoveOpen] = useState(false);
  const [moveType, setMoveType] = useState<"vault_to_petty" | "petty_spend" | "petty_return">(
    "petty_spend",
  );
  const [moveDate, setMoveDate] = useState(todayInput);
  const [moveAmount, setMoveAmount] = useState("");
  const [moveNotes, setMoveNotes] = useState("");
  const [moveGlAccountId, setMoveGlAccountId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pcRes, catRes] = await Promise.all([
        fetch("/api/finance/petty-cash", { credentials: "include" }),
        fetch("/api/finance/expenses/categories", { credentials: "include" }),
      ]);
      const pcBody = (await pcRes.json()) as {
        ok: boolean;
        data?: { float: FloatRow | null; balanceCents: number; movements: MovementRow[] };
        error?: { message: string };
      };
      if (!pcRes.ok || !pcBody.ok || !pcBody.data) {
        throw new Error(pcBody.error?.message ?? "Could not load petty cash.");
      }
      setFloat(pcBody.data.float);
      setBalanceCents(pcBody.data.balanceCents);
      setMovements(pcBody.data.movements);

      if (catRes.ok) {
        const catBody = (await catRes.json()) as {
          ok?: boolean;
          data?: { items?: GlOption[] };
        };
        if (catBody.ok && catBody.data?.items) {
          setGlOptions(catBody.data.items);
          if (catBody.data.items[0]?.glAccountId) {
            setMoveGlAccountId(catBody.data.items[0].glAccountId);
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load petty cash.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitOpenFloat(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/finance/petty-cash", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "open_float",
          openingDate: new Date(`${openingDate}T12:00:00`).toISOString(),
          amountDollars: openingAmount,
        }),
      });
      const body = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not open float.");
        return;
      }
      setOpenFloatOpen(false);
      setOpeningAmount("");
      await load();
    } catch {
      setError("Could not open float.");
    } finally {
      setSaving(false);
    }
  }

  async function submitMovement(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/finance/petty-cash", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "movement",
          movementType: moveType,
          movementDate: new Date(`${moveDate}T12:00:00`).toISOString(),
          amountDollars: moveAmount,
          notes: moveNotes || null,
          expenseGlAccountId: moveType === "petty_spend" ? moveGlAccountId || null : null,
        }),
      });
      const body = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not record movement.");
        return;
      }
      setMoveOpen(false);
      setMoveAmount("");
      setMoveNotes("");
      await load();
    } catch {
      setError("Could not record movement.");
    } finally {
      setSaving(false);
    }
  }

  const currency = float?.currency ?? "USD";

  return (
    <section className="view active scrollable finance-desk-view" aria-label="Petty cash">
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Petty cash</h3>
            <p className="panel-subtitle muted">
              Business vault float · GL account 1050
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
            <ExportMenu kind="petty_cash_summary" formats={["pdf", "docx", "xlsx"]} disabled={loading} />
            <Button size="sm" variant="outline" onClick={() => load()} disabled={loading}>
              Refresh
            </Button>
          </div>
        </div>
        <div className="panel-body">
          <FirmMoneyCallout />

          <div className="trust-overview-cards" style={{ marginBottom: "1rem" }}>
            <div className="trust-overview-card panel">
              <div className="trust-overview-card-label">Current balance</div>
              <div className="trust-overview-card-balance">
                {centsToDisplay(balanceCents, currency)}
              </div>
            </div>
            {float ? (
              <div className="trust-overview-card panel">
                <div className="trust-overview-card-label">Opening float</div>
                <div className="trust-overview-card-balance">
                  {centsToDisplay(float.amountCents, currency)}
                </div>
                <div className="muted" style={{ fontSize: "0.75rem" }}>
                  Opened {new Date(float.openingDate).toLocaleDateString()}
                </div>
              </div>
            ) : null}
          </div>

          {error ? (
            <p role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem" }}>
              {error}
            </p>
          ) : null}

          <Can permission="finance.post">
            <div style={{ display: "flex", gap: "0.35rem", marginBottom: "1rem" }}>
              {!float ? (
                <Button size="sm" onClick={() => setOpenFloatOpen(true)}>
                  Open float
                </Button>
              ) : (
                <Button size="sm" onClick={() => setMoveOpen(true)}>
                  Record movement
                </Button>
              )}
            </div>
          </Can>

          {openFloatOpen ? (
            <form onSubmit={submitOpenFloat} className="panel" style={{ padding: "1rem", marginBottom: "1rem" }}>
              <h4 style={{ marginTop: 0 }}>Open petty cash float</h4>
              <div className="grid-2">
                <div className="form-group">
                  <label htmlFor="pc-open-date">Opening date</label>
                  <input
                    id="pc-open-date"
                    type="date"
                    value={openingDate}
                    onChange={(e) => setOpeningDate(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="pc-open-amt">Float amount</label>
                  <input
                    id="pc-open-amt"
                    type="number"
                    min={0.01}
                    step="0.01"
                    value={openingAmount}
                    onChange={(e) => setOpeningAmount(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <Button type="submit" size="sm" disabled={saving}>
                  Open
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setOpenFloatOpen(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : null}

          {moveOpen ? (
            <form onSubmit={submitMovement} className="panel" style={{ padding: "1rem", marginBottom: "1rem" }}>
              <h4 style={{ marginTop: 0 }}>Record petty cash movement</h4>
              <div className="grid-2">
                <div className="form-group">
                  <label htmlFor="pc-move-type">Type</label>
                  <select
                    id="pc-move-type"
                    value={moveType}
                    onChange={(e) =>
                      setMoveType(e.target.value as "vault_to_petty" | "petty_spend" | "petty_return")
                    }
                  >
                    <option value="vault_to_petty">Transfer from business vault</option>
                    <option value="petty_spend">Petty spend</option>
                    <option value="petty_return">Return to vault</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="pc-move-date">Date</label>
                  <input
                    id="pc-move-date"
                    type="date"
                    value={moveDate}
                    onChange={(e) => setMoveDate(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="pc-move-amt">Amount</label>
                <input
                  id="pc-move-amt"
                  type="number"
                  min={0.01}
                  step="0.01"
                  value={moveAmount}
                  onChange={(e) => setMoveAmount(e.target.value)}
                  required
                />
              </div>
              {moveType === "petty_spend" ? (
                <div className="form-group">
                  <label htmlFor="pc-move-gl">Expense category (GL)</label>
                  <select
                    id="pc-move-gl"
                    value={moveGlAccountId}
                    onChange={(e) => setMoveGlAccountId(e.target.value)}
                  >
                    {glOptions.map((o) =>
                      o.glAccountId ? (
                        <option key={o.code} value={o.glAccountId}>
                          {o.label}
                        </option>
                      ) : null,
                    )}
                  </select>
                </div>
              ) : null}
              <div className="form-group">
                <label htmlFor="pc-move-notes">Notes</label>
                <textarea
                  id="pc-move-notes"
                  rows={2}
                  value={moveNotes}
                  onChange={(e) => setMoveNotes(e.target.value)}
                />
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <Button type="submit" size="sm" disabled={saving}>
                  Save
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setMoveOpen(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : null}

          {!float && !loading ? (
            <EmptyState
              title="No open petty cash float"
              detail="Open a float to track vault transfers and petty spend."
            />
          ) : null}

          {movements.length ? (
            <div className="table-wrap">
              <table className="data data-dense">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => (
                    <tr key={m.id}>
                      <td>{new Date(m.movementDate).toLocaleDateString()}</td>
                      <td>{MOVEMENT_LABELS[m.movementType] ?? m.movementType}</td>
                      <td>{centsToDisplay(m.amountCents, m.currency)}</td>
                      <td>{m.notes ?? m.reference ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
