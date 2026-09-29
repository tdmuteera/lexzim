"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

type AccountOption = { id: string; name: string; isActive: boolean };
type ClientOption = { id: string; displayLabel: string; clientNumber: string | null };
type MatterOption = { id: string; title: string; matterNumber: string | null };

function useClientMatters(clientId: string) {
  const [loaded, setLoaded] = useState<{ clientId: string; items: MatterOption[] }>({
    clientId: "",
    items: [],
  });
  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    void fetch(`/api/matters?bucket=all&clientId=${encodeURIComponent(clientId)}`, {
      credentials: "include",
    })
      .then((r) => r.json())
      .then((body: { ok?: boolean; data?: { items?: MatterOption[] } }) => {
        if (!cancelled) setLoaded({ clientId, items: body.ok ? (body.data?.items ?? []) : [] });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ clientId, items: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [clientId]);
  return clientId && loaded.clientId === clientId ? loaded.items : [];
}

function todayInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Managing Partner moves trust money from one client ledger to another (same trust account). */
export function ClientTransferModal({
  open,
  onClose,
  onDone,
  accounts,
  clients,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void | Promise<void>;
  accounts: AccountOption[];
  clients: ClientOption[];
}) {
  const { toast } = useToast();
  const activeAccounts = accounts.filter((a) => a.isActive);
  const [trustAccountId, setTrustAccountId] = useState("");
  const [fromClientId, setFromClientId] = useState("");
  const [fromMatterId, setFromMatterId] = useState("");
  const [toClientId, setToClientId] = useState("");
  const [toMatterId, setToMatterId] = useState("");
  const [amountDollars, setAmountDollars] = useState("");
  const [occurredAt, setOccurredAt] = useState(todayInput);
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKey = useRef("");

  const fromMatters = useClientMatters(fromClientId);
  const toMatters = useClientMatters(toClientId);

  useEffect(() => {
    if (open) {
      idempotencyKey.current = `ctt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }
  }, [open]);

  const accountId = trustAccountId || activeAccounts[0]?.id || "";

  function close() {
    setError(null);
    onClose();
  }

  function label(c: ClientOption) {
    return c.clientNumber ? `${c.clientNumber} · ${c.displayLabel}` : c.displayLabel;
  }

  async function submit() {
    setError(null);
    if (!accountId || !fromClientId || !toClientId) {
      setError("Choose the trust account, the paying client and the receiving client.");
      return;
    }
    if (fromClientId === toClientId && fromMatterId === toMatterId) {
      setError("Paying and receiving ledgers must differ.");
      return;
    }
    if (!reason.trim()) {
      setError("A reason is required for a client to client transfer.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/trust/client-transfer", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trustAccountId: accountId,
          fromClientId,
          fromMatterId: fromMatterId || null,
          toClientId,
          toMatterId: toMatterId || null,
          amountDollars,
          occurredAt: new Date(`${occurredAt}T12:00:00`).toISOString(),
          reference: reference || null,
          reason: reason.trim(),
          idempotencyKey: idempotencyKey.current,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: { message?: string } };
      if (!res.ok || body.ok === false) {
        setError(body.error?.message ?? "Could not post the transfer.");
        return;
      }
      toast("Client to client transfer posted.");
      setAmountDollars("");
      setReference("");
      setReason("");
      close();
      await onDone();
    } catch {
      setError("Could not post the transfer.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Transfer between clients"
      onClose={() => (saving ? undefined : close())}
      footer={
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
          <Button variant="outline" size="sm" onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => void submit()} disabled={saving}>
            {saving ? "Posting…" : "Post transfer"}
          </Button>
        </div>
      }
    >
      <p className="muted" style={{ fontSize: "0.85rem", marginBottom: "0.75rem" }}>
        Moves client money from one client ledger to another inside the same trust account. The
        bank balance does not change. Managing Partner only. The paying client cannot go below zero.
      </p>
      <div className="form-group">
        <label htmlFor="ctt-account">Trust account</label>
        <select id="ctt-account" value={accountId} onChange={(e) => setTrustAccountId(e.target.value)}>
          <option value="">Select account</option>
          {activeAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label htmlFor="ctt-from">From client (paying)</label>
        <select
          id="ctt-from"
          value={fromClientId}
          onChange={(e) => {
            setFromClientId(e.target.value);
            setFromMatterId("");
          }}
        >
          <option value="">Select client</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {label(c)}
            </option>
          ))}
        </select>
      </div>
      {fromMatters.length ? (
        <div className="form-group">
          <label htmlFor="ctt-from-matter">From matter (optional)</label>
          <select id="ctt-from-matter" value={fromMatterId} onChange={(e) => setFromMatterId(e.target.value)}>
            <option value="">No specific matter</option>
            {fromMatters.map((m) => (
              <option key={m.id} value={m.id}>
                {m.matterNumber ? `${m.matterNumber} · ${m.title}` : m.title}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="form-group">
        <label htmlFor="ctt-to">To client (receiving)</label>
        <select
          id="ctt-to"
          value={toClientId}
          onChange={(e) => {
            setToClientId(e.target.value);
            setToMatterId("");
          }}
        >
          <option value="">Select client</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {label(c)}
            </option>
          ))}
        </select>
      </div>
      {toMatters.length ? (
        <div className="form-group">
          <label htmlFor="ctt-to-matter">To matter (optional)</label>
          <select id="ctt-to-matter" value={toMatterId} onChange={(e) => setToMatterId(e.target.value)}>
            <option value="">No specific matter</option>
            {toMatters.map((m) => (
              <option key={m.id} value={m.id}>
                {m.matterNumber ? `${m.matterNumber} · ${m.title}` : m.title}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
        <div className="form-group">
          <label htmlFor="ctt-amount">Amount (USD)</label>
          <input
            id="ctt-amount"
            inputMode="decimal"
            value={amountDollars}
            onChange={(e) => setAmountDollars(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="ctt-date">Date</label>
          <input id="ctt-date" type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
        </div>
      </div>
      <div className="form-group">
        <label htmlFor="ctt-ref">Reference (optional)</label>
        <input id="ctt-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
      </div>
      <div className="form-group">
        <label htmlFor="ctt-reason">Reason (required, kept on the audit trail)</label>
        <textarea id="ctt-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      {error ? (
        <p role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem" }}>
          {error}
        </p>
      ) : null}
    </Modal>
  );
}
