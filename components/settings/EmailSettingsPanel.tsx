"use client";

import { useCallback, useEffect, useState } from "react";
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
  configured: boolean;
};

export function EmailSettingsPanel() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setPassword("");
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
    try {
      const result = await diagnosticJson<{ to: string }>("/api/settings/email/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testTo.trim() || undefined }),
      });
      if (!result.ok) {
        setError(
          errorMessageWithRef(
            result.error?.message ?? "Test send failed.",
            result.requestId,
          ),
        );
        return;
      }
      toast(`Test email sent to ${result.data?.to ?? "recipient"}.`);
    } catch {
      setError("Test send failed.");
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
          className="settings-hint"
          style={{
            marginTop: "0.75rem",
            padding: "0.65rem 0.75rem",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            background: "var(--surface-muted, #f8f8f6)",
            fontSize: "0.85rem",
            lineHeight: 1.45,
          }}
        >
          <strong>Pilot guidance (T Pfigu Attorneys):</strong> set From/Reply-To to the address your
          partner provides (commonly their public info mailbox, for example{" "}
          <code>info@tpfiguattorneys.com</code>). This is configured per firm in Settings. LexZim
          never applies that address as a global default for other firms.
        </aside>
        {error ? (
          <p role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem" }}>
            {error}
          </p>
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
                  placeholder="smtp.example.com"
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
                    onChange={(e) => setPort(e.target.value)}
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
                  placeholder="Firm name"
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
                  placeholder="name@yourfirm.co.zw"
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
                  placeholder="name@yourfirm.co.zw"
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
              <label>
                <div className="muted" style={{ fontSize: "0.8rem" }}>
                  Recipient (defaults to from address)
                </div>
                <input
                  type="email"
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  placeholder="you@yourfirm.co.zw"
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
