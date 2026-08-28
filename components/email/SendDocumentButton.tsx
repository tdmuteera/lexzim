"use client";

import { useCallback, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import {
  diagnosticJson,
  errorMessageWithRef,
} from "@/lib/diagnostics/client";

type Props = {
  kind: "quotation" | "invoice" | "receipt";
  id: string;
  defaultEmail?: string | null;
  /** Optional label override, e.g. "Invoice INV-001". */
  documentLabel?: string | null;
  label?: string;
  size?: "sm" | "md";
  variant?: "outline" | "primary" | "gold" | "ghost";
  disabled?: boolean;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

type PreviewData = {
  to: string | null;
  documentLabel: string;
  documentNumber: string;
  firmName: string;
  attachmentFilename: string;
  subjectDefault: string;
};

/**
 * Emails a quotation / invoice / receipt as a PDF attachment.
 * Manual review of To, Subject, body note, and attachment before Send.
 */
export function SendDocumentButton({
  kind,
  id,
  defaultEmail,
  documentLabel: documentLabelProp,
  label = "Send email",
  size = "sm",
  variant = "outline",
  disabled,
}: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const firmName = user?.firm.name ?? "Firm";

  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(defaultEmail ?? "");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [attachmentFilename, setAttachmentFilename] = useState<string | null>(null);
  const [documentLabel, setDocumentLabel] = useState(documentLabelProp ?? "");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kindTitle =
    kind === "quotation" ? "Quotation" : kind === "invoice" ? "Invoice" : "Receipt";

  const openComposer = useCallback(async () => {
    setOpen(true);
    setError(null);
    setMessage("");
    const prefillTo = (defaultEmail ?? "").trim();
    setTo(prefillTo);
    const labelGuess = documentLabelProp?.trim() || kindTitle;
    setDocumentLabel(labelGuess);
    setSubject(`${labelGuess} — ${firmName}`);
    setAttachmentFilename(null);
    setLoadingPreview(true);
    try {
      const result = await diagnosticJson<PreviewData>(
        `/api/email/send?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`,
      );
      if (!result.ok || !result.data) {
        setError(
          errorMessageWithRef(
            result.error?.message ?? "Could not load send preview.",
            result.requestId,
          ),
        );
        return;
      }
      const data = result.data;
      setDocumentLabel(data.documentLabel);
      setAttachmentFilename(data.attachmentFilename);
      setSubject(data.subjectDefault);
      if (!prefillTo && data.to) setTo(data.to);
    } catch {
      setError("Could not load send preview.");
    } finally {
      setLoadingPreview(false);
    }
  }, [defaultEmail, documentLabelProp, firmName, id, kind, kindTitle]);

  async function send() {
    const trimmedTo = to.trim();
    if (!isValidEmail(trimmedTo)) {
      setError("Enter a valid recipient email.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const result = await diagnosticJson<{ to: string }>("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          id,
          to: trimmedTo,
          subject: subject.trim() || undefined,
          message: message.trim() || undefined,
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
      toast(`Emailed to ${result.data?.to ?? trimmedTo}.`);
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
      <Button size={size} variant={variant} disabled={disabled} onClick={() => void openComposer()}>
        {label}
      </Button>
    );
  }

  const canSend = isValidEmail(to) && !sending && !loadingPreview;

  return (
    <div
      style={{
        display: "grid",
        gap: "0.4rem",
        padding: "0.6rem",
        border: "1px solid var(--border)",
        borderRadius: "8px",
        minWidth: "20rem",
        maxWidth: "26rem",
        background: "var(--surface, #fff)",
      }}
    >
      <strong style={{ fontSize: "0.9rem" }}>Send {documentLabel || kindTitle}</strong>
      {loadingPreview ? (
        <p className="muted" style={{ fontSize: "0.78rem", margin: 0 }}>
          Loading recipient…
        </p>
      ) : null}
      <label>
        <div className="muted" style={{ fontSize: "0.75rem" }}>
          To
        </div>
        <input
          type="email"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="client@example.com"
          autoComplete="email"
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
          Body note (optional)
        </div>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          placeholder="Optional note included above the signature."
          style={{ width: "100%", marginTop: "0.2rem", padding: "0.4rem 0.55rem" }}
        />
      </label>
      <p className="muted" style={{ fontSize: "0.75rem", margin: 0 }}>
        Attachment:{" "}
        <strong style={{ color: "var(--text, inherit)" }}>
          {attachmentFilename ?? `${kindTitle}-….pdf`}
        </strong>
      </p>
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
  );
}
