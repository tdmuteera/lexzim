"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import {
  diagnosticJson,
  errorMessageWithRef,
} from "@/lib/diagnostics/client";

type Props = {
  clientId: string;
  defaultEmail?: string | null;
  defaultSubject?: string;
  buttonLabel?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Generic notification composer to a client's email. Gated to MP (users.manage)
 * or accounts (billing.manage) by the caller's <Can> wrapper.
 * Manual send only.
 */
export function ClientEmailButton({
  clientId,
  defaultEmail,
  defaultSubject,
  buttonLabel = "Email client",
}: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(defaultEmail ?? "");
  const [subject, setSubject] = useState(defaultSubject ?? "");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    const trimmedTo = to.trim();
    if (trimmedTo && !EMAIL_RE.test(trimmedTo)) {
      setError("Enter a valid recipient email.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const result = await diagnosticJson<{ to: string }>("/api/email/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          subject: subject.trim(),
          body: body.trim(),
          to: trimmedTo || undefined,
        }),
      });
      if (!result.ok) {
        setError(
          errorMessageWithRef(
            result.error?.message ?? "Could not send email.",
            result.requestId,
          ),
        );
        return;
      }
      toast(`Email sent to ${result.data?.to ?? "client"}.`);
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
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          setOpen(true);
          setError(null);
          setTo(defaultEmail ?? "");
          setSubject(defaultSubject ?? "");
        }}
      >
        {buttonLabel}
      </Button>
    );
  }

  const canSend = Boolean(subject.trim() && body.trim()) && !sending;

  return (
    <div
      className="panel"
      style={{ position: "absolute", zIndex: 30, marginTop: "2.5rem", width: "24rem", right: 0 }}
    >
      <div className="panel-body" style={{ display: "grid", gap: "0.5rem" }}>
        <strong>Craft birthday / client email</strong>
        <p className="muted" style={{ margin: 0, fontSize: "0.78rem" }}>
          Write the message and paste your signature below, then confirm Send. Nothing is sent until
          you click Send.
        </p>
        <label>
          <div className="muted" style={{ fontSize: "0.75rem" }}>
            Recipient
          </div>
          <input
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="client@example.com"
            style={{ width: "100%", marginTop: "0.2rem", padding: "0.4rem 0.55rem" }}
          />
        </label>
        <label>
          <div className="muted" style={{ fontSize: "0.75rem" }}>
            Subject
          </div>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={200}
            style={{ width: "100%", marginTop: "0.2rem", padding: "0.4rem 0.55rem" }}
          />
        </label>
        <label>
          <div className="muted" style={{ fontSize: "0.75rem" }}>
            Message
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            style={{ width: "100%", marginTop: "0.2rem", padding: "0.4rem 0.55rem" }}
          />
        </label>
        {error ? (
          <p style={{ color: "var(--danger)", fontSize: "0.78rem", margin: 0 }} role="alert">
            {error}
          </p>
        ) : null}
        <div style={{ display: "flex", gap: "0.4rem" }}>
          <Button size="sm" variant="gold" onClick={() => void send()} disabled={!canSend}>
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
