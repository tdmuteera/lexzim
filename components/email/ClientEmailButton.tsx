"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

type Props = {
  clientId: string;
  defaultEmail?: string | null;
};

/**
 * Generic notification composer to a client's email. Gated to MP (users.manage)
 * or accounts (billing.manage) by the caller's <Can> wrapper.
 */
export function ClientEmailButton({ clientId, defaultEmail }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(defaultEmail ?? "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/email/compose", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, subject, body, to: to.trim() || undefined }),
      });
      const payload = (await res.json()) as {
        ok: boolean;
        data?: { to: string };
        error?: { message: string };
      };
      if (!res.ok || !payload.ok) {
        setError(payload.error?.message ?? "Could not send email.");
        return;
      }
      toast(`Email sent to ${payload.data?.to ?? "client"}.`);
      setOpen(false);
      setSubject("");
      setBody("");
    } catch {
      setError("Could not send email.");
    } finally {
      setSending(false);
    }
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Email client
      </Button>
    );
  }

  return (
    <div
      className="panel"
      style={{ position: "absolute", zIndex: 30, marginTop: "2.5rem", width: "24rem", right: 0 }}
    >
      <div className="panel-body" style={{ display: "grid", gap: "0.5rem" }}>
        <strong>Email client</strong>
        <label>
          <div className="muted" style={{ fontSize: "0.75rem" }}>Recipient</div>
          <input
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="client@example.com"
            style={{ width: "100%", marginTop: "0.2rem", padding: "0.4rem 0.55rem" }}
          />
        </label>
        <label>
          <div className="muted" style={{ fontSize: "0.75rem" }}>Subject</div>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            style={{ width: "100%", marginTop: "0.2rem", padding: "0.4rem 0.55rem" }}
          />
        </label>
        <label>
          <div className="muted" style={{ fontSize: "0.75rem" }}>Message</div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            style={{ width: "100%", marginTop: "0.2rem", padding: "0.4rem 0.55rem" }}
          />
        </label>
        {error ? (
          <p style={{ color: "var(--danger)", fontSize: "0.78rem", margin: 0 }}>{error}</p>
        ) : null}
        <div style={{ display: "flex", gap: "0.4rem" }}>
          <Button
            size="sm"
            variant="gold"
            onClick={() => void send()}
            disabled={sending || !subject.trim() || !body.trim()}
          >
            {sending ? "Sending…" : "Send"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={sending}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
