"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Can } from "@/components/auth/Can";
import { FirmMoneyCallout } from "@/components/finance/FirmMoneyCallout";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { centsToDisplay, dollarsToCents } from "@/lib/billing/money";

type Position = { code: string; label: string; balanceCents: number };

type Transfer = {
  entryId: string;
  entryDate: string;
  memo: string | null;
  fromCode: string;
  toCode: string;
  amountCents: number;
  postedBy: string | null;
  reversed: boolean;
  isReversal: boolean;
};

type TransferData = {
  positions: Position[];
  floatTargetCents: number;
  canReverse: boolean;
  transfers: Transfer[];
};

async function fetchTransfers(): Promise<TransferData | { error: string }> {
  try {
    const res = await fetch("/api/finance/transfers", { credentials: "include" });
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      data?: TransferData;
      error?: { message?: string };
    };
    if (!res.ok || !body.ok || !body.data) return { error: body.error?.message ?? "Could not load transfers." };
    return body.data;
  } catch {
    return { error: "Could not load transfers." };
  }
}

function todayInput() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Move firm money between the operating bank, Business Cash Book, petty cash and disbursement float. */
export function FundsTransferView() {
  const { user } = useAuth();
  const { toast } = useToast();
  const currency = user?.firm?.defaultCurrency || "USD";
  const isManagingPartner = user?.role?.code === "managing_partner";

  const [data, setData] = useState<TransferData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [fromAccount, setFromAccount] = useState("1020");
  const [toAccount, setToAccount] = useState("1050");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayInput);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [reversing, setReversing] = useState<Transfer | null>(null);
  const [reason, setReason] = useState("");
  const [reverseError, setReverseError] = useState<string | null>(null);

  const apply = useCallback((result: TransferData | { error: string }) => {
    if ("error" in result) {
      setLoadError(result.error);
      return;
    }
    setLoadError(null);
    setData(result);
  }, []);

  const load = useCallback(async () => apply(await fetchTransfers()), [apply]);

  useEffect(() => {
    let cancelled = false;
    void fetchTransfers().then((result) => {
      if (!cancelled) apply(result);
    });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  const positions = data?.positions ?? [];
  const labelOf = (code: string) => positions.find((p) => p.code === code)?.label ?? code;
  const balanceOf = (code: string) => positions.find((p) => p.code === code)?.balanceCents ?? 0;
  const floatShortCents = data ? Math.max(0, data.floatTargetCents - balanceOf("1060")) : 0;
  const fromIsFloat = fromAccount === "1060";

  function prefillFloatTopUp() {
    setToAccount("1060");
    if (fromAccount === "1060") setFromAccount("1020");
    setAmount((floatShortCents / 100).toFixed(2));
    setNote("Monthly float top-up");
    setFormError(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const amountCents = dollarsToCents(amount);
    if (amountCents == null || amountCents < 1) {
      setFormError("Enter an amount greater than zero.");
      return;
    }
    if (fromAccount === toAccount) {
      setFormError("Choose two different accounts.");
      return;
    }
    if (fromIsFloat && !note.trim()) {
      setFormError("A reason is required to move money out of the float.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch("/api/finance/transfers", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromAccount,
          toAccount,
          amountCents,
          entryDate: new Date(`${date}T12:00:00`).toISOString(),
          note: note.trim() || null,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: { message?: string } };
      if (!res.ok || body.ok === false) {
        setFormError(body.error?.message ?? "Could not post the transfer.");
        return;
      }
      toast(`Moved ${centsToDisplay(amountCents, currency)} from ${labelOf(fromAccount)} to ${labelOf(toAccount)}.`);
      setAmount("");
      setNote("");
      await load();
    } catch {
      setFormError("Could not post the transfer.");
    } finally {
      setSaving(false);
    }
  }

  async function submitReverse() {
    if (!reversing) return;
    if (!reason.trim()) {
      setReverseError("A reason is required.");
      return;
    }
    setSaving(true);
    setReverseError(null);
    try {
      const res = await fetch("/api/finance/transfers", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reverse", entryId: reversing.entryId, reason: reason.trim() }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: { message?: string } };
      if (!res.ok || body.ok === false) {
        setReverseError(body.error?.message ?? "Could not reverse the transfer.");
        return;
      }
      toast("Transfer reversed.");
      setReversing(null);
      await load();
    } catch {
      setReverseError("Could not reverse the transfer.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="view active scrollable finance-desk-view" aria-label="Funds transfer">
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Funds Transfer</h3>
            <p className="panel-subtitle muted">
              Move firm money between the operating bank, Business Cash Book, petty cash and the
              disbursement float. Each transfer is one balanced journal in the general ledger.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => void load()}>
            Refresh
          </Button>
        </div>
        <div className="panel-body">
          <FirmMoneyCallout />

          {loadError ? (
            <p role="alert" style={{ color: "var(--danger)" }}>
              {loadError}
            </p>
          ) : null}

          <div className="trust-overview-cards" style={{ marginBottom: "1rem" }}>
            {positions.map((p) => (
              <div key={p.code} className="trust-overview-card panel">
                <div className="trust-overview-card-label">
                  {p.label} ({p.code})
                </div>
                <div
                  className="trust-overview-card-balance"
                  style={{ color: p.balanceCents < 0 ? "var(--danger)" : undefined }}
                >
                  {centsToDisplay(p.balanceCents, currency)}
                </div>
                {p.code === "1060" && data ? (
                  <div className="muted" style={{ fontSize: "0.75rem" }}>
                    Target {centsToDisplay(data.floatTargetCents, currency)}
                    {floatShortCents > 0 ? `, short ${centsToDisplay(floatShortCents, currency)}` : ", fully funded"}
                  </div>
                ) : null}
                {p.code === "1010" ? (
                  <div className="muted" style={{ fontSize: "0.75rem" }}>
                    From postings in the system only
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <Can permission="finance.post">
            <form onSubmit={submit} className="panel" style={{ padding: "1rem", marginBottom: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                <h4 style={{ margin: 0 }}>New transfer</h4>
                {floatShortCents > 0 ? (
                  <Button type="button" size="sm" variant="outline" onClick={prefillFloatTopUp}>
                    Top up float to {centsToDisplay(data?.floatTargetCents ?? 0, currency)}
                  </Button>
                ) : null}
              </div>
              <div className="grid-2" style={{ marginTop: "0.75rem" }}>
                <div className="form-group">
                  <label htmlFor="ft-from">From</label>
                  <select id="ft-from" value={fromAccount} onChange={(e) => setFromAccount(e.target.value)}>
                    {positions.map((p) =>
                      p.code === "1060" && !isManagingPartner ? null : (
                        <option key={p.code} value={p.code}>
                          {p.label} ({centsToDisplay(p.balanceCents, currency)})
                        </option>
                      ),
                    )}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="ft-to">To</label>
                  <select id="ft-to" value={toAccount} onChange={(e) => setToAccount(e.target.value)}>
                    {positions.map((p) => (
                      <option key={p.code} value={p.code} disabled={p.code === fromAccount}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="ft-amount">Amount ({currency})</label>
                  <input
                    id="ft-amount"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="ft-date">Date</label>
                  <input
                    id="ft-date"
                    type="date"
                    max={todayInput()}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="ft-note">{fromIsFloat ? "Reason (required)" : "Note (optional)"}</label>
                <textarea id="ft-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              <p className="muted" style={{ fontSize: "0.8rem" }}>
                Cash accounts cannot be overdrawn. Moving money out of the disbursement float is for the
                Managing Partner only.
              </p>
              {formError ? (
                <p role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem" }}>
                  {formError}
                </p>
              ) : null}
              <Button type="submit" size="sm" disabled={saving || !positions.length}>
                {saving ? "Posting…" : "Post transfer"}
              </Button>
            </form>
          </Can>

          <h4>Transfer history</h4>
          {!data ? null : !data.transfers.length ? (
            <EmptyState title="No transfers yet" detail="Transfers between firm accounts will be listed here." />
          ) : (
            <div className="table-wrap">
              <table className="data data-dense">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>From</th>
                    <th>To</th>
                    <th className="num">Amount</th>
                    <th>Note</th>
                    <th>Posted by</th>
                    {data.canReverse ? <th /> : null}
                  </tr>
                </thead>
                <tbody>
                  {data.transfers.map((t) => (
                    <tr key={t.entryId} style={t.reversed ? { opacity: 0.6 } : undefined}>
                      <td>{new Date(t.entryDate).toLocaleDateString()}</td>
                      <td>{labelOf(t.fromCode)}</td>
                      <td>{labelOf(t.toCode)}</td>
                      <td className="num">{centsToDisplay(t.amountCents, currency)}</td>
                      <td>
                        {t.memo ?? ""}
                        {t.reversed ? <span className="muted"> (reversed)</span> : null}
                      </td>
                      <td>{t.postedBy ?? ""}</td>
                      {data.canReverse ? (
                        <td>
                          {!t.reversed && !t.isReversal ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setReversing(t);
                                setReason("");
                                setReverseError(null);
                              }}
                            >
                              Reverse
                            </Button>
                          ) : null}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Modal
        open={reversing !== null}
        title="Reverse transfer"
        onClose={() => (saving ? undefined : setReversing(null))}
        footer={
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
            <Button variant="outline" size="sm" onClick={() => setReversing(null)} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => void submitReverse()} disabled={saving}>
              {saving ? "Posting…" : "Reverse"}
            </Button>
          </div>
        }
      >
        {reversing ? (
          <p className="muted" style={{ fontSize: "0.85rem" }}>
            Posts an equal and opposite journal moving {centsToDisplay(reversing.amountCents, currency)} from{" "}
            {labelOf(reversing.toCode)} back to {labelOf(reversing.fromCode)}. The original stays on record.
          </p>
        ) : null}
        <div className="form-group">
          <label htmlFor="ft-reason">Reason (required)</label>
          <textarea id="ft-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        {reverseError ? (
          <p role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem" }}>
            {reverseError}
          </p>
        ) : null}
      </Modal>
    </section>
  );
}
