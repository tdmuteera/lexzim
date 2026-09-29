"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

type Props = {
  label: string;
  title: string;
  /** What happens, shown above the reason box. */
  explanation: string;
  url: string;
  /** Extra JSON fields sent with the reason (e.g. { action: "reverse_payment" }). */
  body?: Record<string, unknown>;
  successMessage: string;
  onDone?: () => void | Promise<void>;
  size?: "sm" | "md";
  variant?: "danger" | "outline" | "ghost";
};

/** Money corrections never delete: they post a linked reversal and need a written reason. */
export function ReasonActionButton({
  label,
  title,
  explanation,
  url,
  body,
  successMessage,
  onDone,
  size = "sm",
  variant = "danger",
}: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!reason.trim()) {
      setError("A reason is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, reason: reason.trim() }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: { message?: string } };
      if (!res.ok || json.ok === false) {
        setError(json.error?.message ?? "Could not complete this action.");
        return;
      }
      setOpen(false);
      setReason("");
      toast(successMessage);
      await onDone?.();
    } catch {
      setError("Could not complete this action.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button size={size} variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Modal
        open={open}
        title={title}
        onClose={() => (saving ? undefined : setOpen(false))}
        footer={
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => void submit()} disabled={saving}>
              {saving ? "Saving…" : label}
            </Button>
          </div>
        }
      >
        <p className="muted" style={{ fontSize: "0.85rem", marginBottom: "0.75rem" }}>
          {explanation}
        </p>
        <div className="form-group">
          <label htmlFor="reason-action-text">Reason (kept on the audit trail)</label>
          <textarea
            id="reason-action-text"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            autoFocus
          />
        </div>
        {error ? (
          <p role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem" }}>
            {error}
          </p>
        ) : null}
      </Modal>
    </>
  );
}
