"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  AuthFormPanel,
  AuthMobileBrand,
  AuthScreen,
  AuthVisualPanel,
} from "@/components/auth/AuthChrome";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import {
  diagnosticJson,
  ensureRequestId,
  rememberRequestId,
} from "@/lib/diagnostics/client";
import { PLATFORM_PRODUCT_NAME } from "@/lib/firm/branding";

export function LoginForm() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errorRef, setErrorRef] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  async function onRequestReset() {
    setResetBusy(true);
    setResetMsg(null);
    try {
      const result = await diagnosticJson<{ message?: string }>("/api/auth/reset-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const dataMessage =
        result.data && typeof result.data === "object" && "message" in result.data
          ? String((result.data as { message?: string }).message ?? "")
          : "";
      setResetMsg(
        dataMessage ||
          "If that account exists, your firm administrator has been notified to approve a reset.",
      );
    } catch {
      setResetMsg("Could not submit the request. Try again later.");
    } finally {
      setResetBusy(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setErrorRef(null);
    setLoading(true);
    ensureRequestId();
    try {
      const result = await diagnosticJson("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      if (!result.ok) {
        setError(result.error?.message ?? "Invalid email or password.");
        setErrorRef(result.requestId);
        if (result.requestId) rememberRequestId(result.requestId);
        return;
      }
      if (result.requestId) rememberRequestId(result.requestId);
      await refresh();
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Could not sign in. Check your connection and try again.");
      setErrorRef(ensureRequestId());
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthScreen>
      <AuthVisualPanel variant="login" />
      <AuthFormPanel>
        <AuthMobileBrand />
        <div className="eyebrow">Secure Access</div>
        <h2>Welcome back</h2>
        <p className="sub">Sign in to {PLATFORM_PRODUCT_NAME}</p>

        {error && (
          <div
            className="auth-error"
            role="alert"
            style={{
              marginBottom: "1rem",
              padding: "0.75rem 1rem",
              borderRadius: "8px",
              background: "rgba(168,83,69,0.08)",
              border: "1px solid rgba(168,83,69,0.25)",
              color: "var(--danger)",
              fontSize: "0.88rem",
            }}
          >
            <div>{error}</div>
            {errorRef ? (
              <div
                style={{
                  marginTop: "0.45rem",
                  fontSize: "0.75rem",
                  opacity: 0.85,
                  wordBreak: "break-all",
                }}
              >
                Reference: {errorRef}
              </div>
            ) : null}
          </div>
        )}

        <form onSubmit={onSubmit}>
          <div className="form-group">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="form-group">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="login-row">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ padding: 0, fontSize: "0.82rem" }}
              onClick={() => {
                setResetOpen((v) => !v);
                setResetMsg(null);
              }}
              disabled={loading}
            >
              Forgot / request password reset
            </button>
          </div>
          <Button type="submit" variant="primary" block disabled={loading}>
            <Icon name="login" style={{ marginRight: "0.35rem" }} />
            {loading ? "Signing in…" : "Sign in to platform"}
          </Button>
        </form>

        {resetOpen ? (
          <div
            style={{
              marginTop: "1rem",
              padding: "0.85rem 1rem",
              borderRadius: "8px",
              border: "1px solid var(--border)",
              background: "rgba(0,0,0,0.02)",
            }}
          >
            <p className="muted" style={{ margin: "0 0 0.5rem", fontSize: "0.82rem" }}>
              Enter your email above, then request a reset. There is no automatic email link: your
              Managing Partner approves the request and issues a temporary password.
            </p>
            {resetMsg ? (
              <p className="settings-hint" style={{ fontSize: "0.82rem" }}>
                {resetMsg}
              </p>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void onRequestReset()}
                disabled={resetBusy || !email.trim()}
              >
                {resetBusy ? "Submitting…" : "Request reset"}
              </Button>
            )}
          </div>
        ) : null}

        <div className="login-security">
          <Icon name="lock" />
          <div>
            Sessions are role-aware (RBAC). Sensitive actions are written to the audit log. Your
            firm workspace is private to your organisation on LexZim.
          </div>
        </div>
      </AuthFormPanel>
    </AuthScreen>
  );
}
