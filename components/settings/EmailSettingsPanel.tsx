"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Can } from "@/components/auth/Can";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import {
  diagnosticJson,
  errorMessageWithRef,
} from "@/lib/diagnostics/client";

type EmailConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  passwordSet: boolean;
  passwordReadable: boolean;
  configured: boolean;
};

function StatusBanner({
  tone,
  children,
}: {
  tone: "error" | "success" | "warn";
  children: ReactNode;
}) {
  const colors =
    tone === "error"
      ? { border: "rgba(168,83,69,0.35)", bg: "var(--danger-bg)", text: "var(--danger)" }
      : tone === "success"
        ? { border: "rgba(46,125,90,0.35)", bg: "rgba(46,125,90,0.08)", text: "var(--success, #2e7d5a)" }
        : { border: "rgba(160,124,56,0.35)", bg: "rgba(160,124,56,0.08)", text: "var(--gold-2)" };
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className="settings-callout"
      style={{
        marginTop: "0.75rem",
        marginBottom: 0,
        borderColor: colors.border,
        background: colors.bg,
        color: colors.text,
        fontSize: "0.85rem",
        lineHeight: 1.45,
      }}
    >
      {children}
    </p>
  );
}

export function EmailSettingsPanel() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [testFeedback, setTestFeedback] = useState<string | null>(null);

  const [host, setHost] = useState("");
  const [port, setPort] = useState("587");
  const [secure, setSecure] = useState(false);
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [passwordSet, setPasswordSet] = useState(false);
  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [testTo, setTestTo] = useState("");
  const [passwordReadable, setPasswordReadable] = useState(true);
  const [configured, setConfigured] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await diagnosticJson<{ config: EmailConfig }>("/api/settings/email");
      if (!result.ok || !result.data) {
        setError(
          errorMessageWithRef(
            result.error?.message ?? "Could not load email settings.",
            result.requestId,
          ),
        );
        return;
      }
      const c = result.data.config;
      setHost(c.host);
      setPort(String(c.port));
      setSecure(c.secure);
      setUser(c.user);
      setFromName(c.fromName);
      setFromEmail(c.fromEmail);
      setReplyTo(c.replyTo);
      setPasswordSet(c.passwordSet);
      setPasswordReadable(c.passwordReadable);
      setConfigured(c.configured);
      setPassword("");
    } catch {
      setError("Could not load email settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    setTestFeedback(null);
    if (!passwordSet && !password.trim()) {
      setError("Enter the mailbox password before saving SMTP settings.");
      setSaving(false);
      return;
    }
    try {
      const result = await diagnosticJson<{ config: EmailConfig }>("/api/settings/email", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host,
          port: Number(port),
          secure,
          user,
          ...(password.trim() ? { password } : {}),
          fromName,
          fromEmail,
          replyTo,
        }),
      });
      if (!result.ok || !result.data) {
        setError(
          errorMessageWithRef(result.error?.message ?? "Could not save.", result.requestId),
        );
        return;
      }
      setPasswordSet(result.data.config.passwordSet);
      setPasswordReadable(result.data.config.passwordReadable);
      setConfigured(result.data.config.configured);
      setPassword("");
      setSuccess("Email settings saved.");
      toast("Email settings saved.");
    } catch {
      setError("Could not save.");
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    setError(null);
    setSuccess(null);
    setTestFeedback(null);
    if (!configured) {
      setTestFeedback(
        passwordSet && !passwordReadable
          ? "Stored password could not be read. Re-enter the mailbox password, save, then test again."
          : "Save complete SMTP settings (including password) before sending a test email.",
      );
      setTesting(false);
      return;
    }
    try {
      const result = await diagnosticJson<{ to: string }>("/api/settings/email/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testTo.trim() || undefined }),
      });
      if (!result.ok) {
        const msg = errorMessageWithRef(
          result.error?.message ?? "Test send failed.",
          result.requestId,
        );
        setTestFeedback(msg);
        return;
      }
      const recipient = result.data?.to ?? (testTo.trim() || fromEmail);
      setTestFeedback(`Test email sent to ${recipient}. Check inbox and spam.`);
      toast(`Test email sent to ${recipient}.`);
    } catch {
      setTestFeedback("Test send failed. Check your connection and SMTP settings.");
    } finally {
      setTesting(false);
    }
  }

  const inputStyle = { width: "100%", marginTop: "0.25rem", padding: "0.45rem 0.6rem" };

  return (
    <div className="settings-form">
      <div className="settings-form-head">
        <p className="settings-lede">
          Outbound email uses your firm SMTP server (host, port, credentials). Secrets are stored
          encrypted and never sent to the browser. Leave blank to fall back to a managed relay if
          the deployment provides one. Client document email is always manual: review To, Subject,
          note, and attachment, then click Send. LexZim does not auto-email clients.
        </p>
        <aside
          className="settings-hint settings-callout"
          style={{ marginTop: "0.75rem" }}
        >
          <strong>T Pfigu Attorneys (cPanel mail):</strong> SMTP host{" "}
          <code>mail.tpfiguattorneys.com</code>, port <code>465</code>, enable{" "}
          <strong>SSL/TLS (465)</strong>, username <code>info@tpfiguattorneys.com</code>, From{" "}
          <code>info@tpfiguattorneys.com</code>. IMAP/POP3/CalDAV are for phone or Outlook only;
          LexZim sends outbound mail via SMTP.
        </aside>
        {error ? <StatusBanner tone="error">{error}</StatusBanner> : null}
        {success ? <StatusBanner tone="success">{success}</StatusBanner> : null}
        {passwordSet && !passwordReadable ? (
          <StatusBanner tone="warn">
            A password is stored but could not be read by the server. Re-enter the mailbox
            password below and click Save email settings.
          </StatusBanner>
        ) : null}
      </div>

      <Can
        permission="settings.manage"
        fallback={<p className="settings-hint">Ask a managing partner to configure firm email.</p>}
      >
        {loading ? (
          <p className="muted" style={{ fontSize: "0.85rem" }}>
            Loading…
          </p>
        ) : (
          <>
            <section
              className="settings-section"
              style={{ display: "grid", gap: "0.65rem", maxWidth: "34rem" }}
            >
              <h3 className="settings-section-title">SMTP server</h3>
              <label>
                <div className="muted" style={{ fontSize: "0.8rem" }}>
                  Host
                </div>
                <input
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="mail.tpfiguattorneys.com"
                  style={inputStyle}
                />
              </label>
              <div style={{ display: "flex", gap: "0.65rem" }}>
                <label style={{ flex: 1 }}>
                  <div className="muted" style={{ fontSize: "0.8rem" }}>
                    Port
                  </div>
                  <input
                    value={port}
                    onChange={(e) => {
                      const next = e.target.value;
                      setPort(next);
                      if (next === "465") setSecure(true);
                      if (next === "587") setSecure(false);
                    }}
                    inputMode="numeric"
                    style={inputStyle}
                  />
                </label>
                <label
                  style={{
                    display: "flex",
                    alignItems: "flex-end",
                    gap: "0.4rem",
                    paddingBottom: "0.5rem",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={secure}
                    onChange={(e) => setSecure(e.target.checked)}
                  />
                  <span style={{ fontSize: "0.85rem" }}>SSL/TLS (465)</span>
                </label>
              </div>
              <label>
                <div className="muted" style={{ fontSize: "0.8rem" }}>
                  Username
                </div>
                <input
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  placeholder="info@tpfiguattorneys.com"
                  autoComplete="off"
                  style={inputStyle}
                />
              </label>
              <label>
                <div className="muted" style={{ fontSize: "0.8rem" }}>
                  Password {passwordSet ? "(set — leave blank to keep)" : ""}
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={passwordSet ? "••••••••" : ""}
                  autoComplete="new-password"
                  style={inputStyle}
                />
              </label>
            </section>

            <section
              className="settings-section"
              style={{ display: "grid", gap: "0.65rem", maxWidth: "34rem" }}
            >
              <h3 className="settings-section-title">Sender identity</h3>
              <label>
                <div className="muted" style={{ fontSize: "0.8rem" }}>
                  From name
                </div>
                <input
                  value={fromName}
                  onChange={(e) => setFromName(e.target.value)}
                  placeholder="T Pfigu Attorneys"
                  style={inputStyle}
                />
              </label>
              <label>
                <div className="muted" style={{ fontSize: "0.8rem" }}>
                  From email
                </div>
                <input
                  type="email"
                  value={fromEmail}
                  onChange={(e) => setFromEmail(e.target.value)}
                  placeholder="info@tpfiguattorneys.com"
                  style={inputStyle}
                />
              </label>
              <label>
                <div className="muted" style={{ fontSize: "0.8rem" }}>
                  Reply-to (optional)
                </div>
                <input
                  type="email"
                  value={replyTo}
                  onChange={(e) => setReplyTo(e.target.value)}
                  placeholder="info@tpfiguattorneys.com"
                  style={inputStyle}
                />
              </label>
              <div className="settings-actions">
                <Button variant="gold" onClick={() => void save()} disabled={saving}>
                  {saving ? "Saving…" : "Save email settings"}
                </Button>
              </div>
            </section>

            <section
              className="settings-section"
              style={{ display: "grid", gap: "0.65rem", maxWidth: "34rem" }}
            >
              <h3 className="settings-section-title">Test send</h3>
              {testFeedback ? (
                <StatusBanner tone={testFeedback.startsWith("Test email sent") ? "success" : "error"}>
                  {testFeedback}
                </StatusBanner>
              ) : null}
              <label>
                <div className="muted" style={{ fontSize: "0.8rem" }}>
                  Recipient (defaults to from address)
                </div>
                <input
                  type="email"
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  placeholder="djtado04@gmail.com"
                  style={inputStyle}
                />
              </label>
              <div className="settings-actions">
                <Button variant="outline" size="sm" onClick={() => void sendTest()} disabled={testing}>
                  {testing ? "Sending…" : "Send test email"}
                </Button>
              </div>
            </section>
          </>
        )}
      </Can>
    </div>
  );
}
