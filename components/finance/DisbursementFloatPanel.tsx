"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Can } from "@/components/auth/Can";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { centsToDisplay, dollarsToCents } from "@/lib/billing/money";

type Movement = {
  entryId: string;
  entryDate: string;
  memo: string | null;
  sourceType: string | null;
  amountCents: number;
};

type Mode = "fund" | "return" | null;

type FloatResult =
  | { balanceCents: number; targetCents: number; movements: Movement[] }
  | { error: string };

async function fetchFloat(): Promise<FloatResult> {
  try {
    const res = await fetch("/api/finance/float", { credentials: "include" });
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      data?: { balanceCents: number; targetCents: number; movements: Movement[] };
      error?: { message?: string };
    };
    if (!res.ok || !body.ok || !body.data) {
      return { error: body.error?.message ?? "Could not load the float." };
    }
    return body.data;
  } catch {
    return { error: "Could not load the float." };
  }
}

const ACCOUNT_LABEL: Record<"1010" | "1020", string> = {
  "1010": "Operating Bank (1010)",
  "1020": "Business Cash Book (1020)",
};

/**
 * Firm money set aside to advance client disbursements when trust is short (GL 1060).
 * Recoveries flow back here; the Managing Partner moves any excess out.
 */
export function DisbursementFloatPanel({
  refreshKey = 0,
  onChanged,
}: {
  refreshKey?: number;
  onChanged?: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const currency = user?.firm?.defaultCurrency || "USD";
  const isManagingPartner = user?.role?.code === "managing_partner";

  const [balanceCents, setBalanceCents] = useState<number | null>(null);
  const [targetCents, setTargetCents] = useState<number | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>(null);
  const [amountDollars, setAmountDollars] = useState("");
  const [account, setAccount] = useState<"1010" | "1020">("1010");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const apply = useCallback((result: FloatResult) => {
    if ("error" in result) {
      setLoadError(result.error);
      return;
    }
    setLoadError(null);
    setBalanceCents(result.balanceCents);
    setTargetCents(result.targetCents);
    setMovements(result.movements);
  }, []);

  const load = useCallback(async () => apply(await fetchFloat()), [apply]);

  useEffect(() => {
    let cancelled = false;
    void fetchFloat().then((result) => {
      if (!cancelled) apply(result);
    });
    return () => {
      cancelled = true;
    };
  }, [apply, refreshKey]);

  const topUpCents =
    balanceCents != null && targetCents != null ? Math.max(0, targetCents - balanceCents) : 0;

  function open(next: Mode, prefillCents = 0) {
    setMode(next);
    setAmountDollars(prefillCents ? (prefillCents / 100).toFixed(2) : "");
    setText(prefillCents ? "Monthly top-up" : "");
    setAccount("1010");
    setFormError(null);
  }

  async function submit() {
    const amountCents = dollarsToCents(amountDollars);
    if (amountCents == null || amountCents < 1) {
      setFormError("Enter an amount greater than zero.");
      return;
    }
    if (mode === "return" && !text.trim()) {
      setFormError("A reason is required to take money out of the float.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch("/api/finance/float", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "fund"
            ? { action: "fund", amountCents, fromAccount: account, note: text.trim() || null }
            : { action: "return", amountCents, toAccount: account, reason: text.trim() },
        ),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: { message?: string } };
      if (!res.ok || body.ok === false) {
        setFormError(body.error?.message ?? "Could not post the float movement.");
        return;
      }
      toast(mode === "fund" ? "Float funded." : "Float excess returned.");
      setMode(null);
      await load();
      onChanged?.();
    } catch {
      setFormError("Could not post the float movement.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="panel" style={{ marginBottom: "1rem" }}>
      <div className="panel-head">
        <div>
          <h3>Disbursement float</h3>
          <p className="panel-subtitle muted">
            Firm money for advancing client disbursements when trust is short. Recoveries return here.
            {targetCents != null
              ? ` Monthly target ${centsToDisplay(targetCents, currency)}.`
              : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.35rem", alignItems: "center", flexWrap: "wrap" }}>
          <strong style={{ fontSize: "1.1rem" }}>
            {balanceCents == null ? "…" : centsToDisplay(balanceCents, currency)}
          </strong>
          <Can permission="finance.post">
            {topUpCents > 0 && targetCents != null ? (
              <Button size="sm" onClick={() => open("fund", topUpCents)}>
                Top up to {centsToDisplay(targetCents, currency)}
              </Button>
            ) : null}
            <Button size="sm" variant={topUpCents > 0 ? "outline" : undefined} onClick={() => open("fund")}>
              Fund float
            </Button>
            {isManagingPartner ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => open("return")}
                disabled={!balanceCents}
              >
                Return excess
              </Button>
            ) : null}
          </Can>
          <Button size="sm" variant="ghost" onClick={() => setShowHistory((v) => !v)}>
            {showHistory ? "Hide movements" : "Movements"}
          </Button>
        </div>
      </div>
      {loadError ? (
        <div className="panel-body">
          <p role="alert" style={{ color: "var(--danger)", margin: 0 }}>
            {loadError}
          </p>
        </div>
      ) : null}
      {showHistory ? (
        <div className="panel-body">
          {!movements.length ? (
            <p className="muted" style={{ margin: 0 }}>
              No float movements yet.
            </p>
          ) : (
            <div className="table-wrap">
              <table className="data data-dense">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Movement</th>
                    <th className="num">In / out</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => (
                    <tr key={m.entryId}>
                      <td>{new Date(m.entryDate).toLocaleDateString()}</td>
                      <td>{m.memo ?? m.sourceType ?? ""}</td>
                      <td
                        className="num"
                        style={{ color: m.amountCents < 0 ? "var(--danger)" : undefined, fontWeight: 600 }}
                      >
                        {centsToDisplay(m.amountCents, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      <Modal
        open={mode !== null}
        title={mode === "fund" ? "Fund the disbursement float" : "Return float excess"}
        onClose={() => (saving ? undefined : setMode(null))}
        footer={
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
            <Button variant="outline" size="sm" onClick={() => setMode(null)} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => void submit()} disabled={saving}>
              {saving ? "Posting…" : mode === "fund" ? "Fund float" : "Return excess"}
            </Button>
          </div>
        }
      >
        <p className="muted" style={{ fontSize: "0.85rem", marginBottom: "0.75rem" }}>
          {mode === "fund"
            ? "Moves firm money into the float. This is firm money, never client trust money."
            : `Moves money out of the float back to firm funds. Managing Partner only. Float holds ${centsToDisplay(balanceCents ?? 0, currency)}.`}
        </p>
        <div className="form-group">
          <label htmlFor="float-amount">Amount ({currency})</label>
          <input
            id="float-amount"
            inputMode="decimal"
            value={amountDollars}
            onChange={(e) => setAmountDollars(e.target.value)}
            autoFocus
          />
        </div>
        <div className="form-group">
          <label htmlFor="float-account">{mode === "fund" ? "Taken from" : "Paid into"}</label>
          <select
            id="float-account"
            value={account}
            onChange={(e) => setAccount(e.target.value as "1010" | "1020")}
          >
            {(["1010", "1020"] as const).map((code) => (
              <option key={code} value={code}>
                {ACCOUNT_LABEL[code]}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="float-text">{mode === "fund" ? "Note (optional)" : "Reason (required)"}</label>
          <textarea id="float-text" rows={2} value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        {formError ? (
          <p role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem" }}>
            {formError}
          </p>
        ) : null}
      </Modal>
    </div>
  );
}
