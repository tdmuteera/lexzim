"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

type Props = {
  kind: "quotation" | "invoice" | "receipt";
  id: string;
  defaultEmail?: string | null;
  label?: string;
  size?: "sm" | "md";
  variant?: "outline" | "primary" | "gold" | "ghost";
  disabled?: boolean;
};

/**
 * Emails a quotation / invoice / receipt as a PDF attachment. Opens a small
 * inline composer to confirm recipient and add an optional note.
 */
export function SendDocumentButton({
  kind,
  id,
  defaultEmail,
  label = "Send email",
  size = "sm",
  variant = "outline",
  disabled,
}: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(defaultEmail ?? "");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id, to: to.trim() || undefined, message: message.trim() || undefined }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { to: string };
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not send email.");
        return;
      }
      toast(`Emailed to ${body.data?.to ?? "recipient"}.`);
      setOpen(false);
      setMessage("");
    } catch {
      setError("Could not send email.");
    } finally {
      setSending(false);
    }
  }

  if (!open) {
    return (
      <Button size={size} variant={variant} disabled={disabled} onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gap: "0.4rem",
        padding: "0.6rem",
        border: "1px solid var(--border)",
        borderRadius: "8px",
        minWidth: "18rem",
        background: "var(--surface, #fff)",
      }}
    >
      <label>
        <div className="muted" style={{ fontSize: "0.75rem" }}>Recipient email</div>
        <input
          type="email"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="client@example.com"
          style={{ width: "100%", marginTop: "0.2rem", padding: "0.4rem 0.55rem" }}
        />
      </label>
      <label>
        <div className="muted" style={{ fontSize: "0.75rem" }}>Message (optional)</div>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          style={{ width: "100%", marginTop: "0.2rem", padding: "0.4rem 0.55rem" }}
        />
      </label>
      {error ? (
        <p style={{ color: "var(--danger)", fontSize: "0.78rem", margin: 0 }}>{error}</p>
      ) : null}
      <div style={{ display: "flex", gap: "0.4rem" }}>
        <Button size="sm" variant="gold" onClick={() => void send()} disabled={sending}>
          {sending ? "Sending…" : "Send PDF"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={sending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
