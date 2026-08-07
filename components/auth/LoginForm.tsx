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
import { PLATFORM_PRODUCT_NAME } from "@/lib/firm/branding";

export function LoginForm() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Invalid email or password.");
        return;
      }
      await refresh();
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Could not sign in. Check your connection and try again.");
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
            {error}
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
            <span className="muted" style={{ fontSize: "0.82rem" }}>
              Password reset: contact your Managing Partner or platform admin (MVP).
            </span>
          </div>
          <Button type="submit" variant="primary" block disabled={loading}>
            <Icon name="login" style={{ marginRight: "0.35rem" }} />
            {loading ? "Signing in…" : "Sign in to platform"}
          </Button>
        </form>

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
