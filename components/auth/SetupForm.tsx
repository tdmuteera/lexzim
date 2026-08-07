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

export function SetupForm() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [firmName, setFirmName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 10) {
      setError("Password must be at least 10 characters.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          firmName,
          fullName,
          email,
          password,
          defaultCurrency: "USD",
        }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not complete setup.");
        return;
      }
      await refresh();
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Could not complete setup. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthScreen>
      <AuthVisualPanel variant="setup" />
      <AuthFormPanel>
        <AuthMobileBrand />
        <div className="eyebrow">Platform bootstrap</div>
        <h2>Welcome to {PLATFORM_PRODUCT_NAME}</h2>
        <p className="sub">Create your firm workspace and Managing Partner account</p>

        {error && (
          <div
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
            <label htmlFor="setup-firm">Firm name</label>
            <input
              id="setup-firm"
              type="text"
              required
              placeholder="e.g. T Pfigu Attorneys"
              value={firmName}
              onChange={(e) => setFirmName(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="form-group">
            <label htmlFor="setup-name">Managing Partner full name</label>
            <input
              id="setup-name"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="form-group">
            <label htmlFor="setup-email">Email</label>
            <input
              id="setup-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="form-group">
            <label htmlFor="setup-password">Password</label>
            <input
              id="setup-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="form-group">
            <label htmlFor="setup-confirm">Confirm password</label>
            <input
              id="setup-confirm"
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="login-security" style={{ marginBottom: "1rem" }}>
            <Icon name="shield" />
            <div>
              Your firm data is stored securely in LexZim cloud hosting (Supabase/Railway). Each
              firm is an isolated tenant on the platform.
            </div>
          </div>

          <Button type="submit" variant="primary" block disabled={loading}>
            {loading ? "Creating firm…" : "Create firm and sign in"}
          </Button>
        </form>
      </AuthFormPanel>
    </AuthScreen>
  );
}
