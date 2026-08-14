"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";

/**
 * Non-blocking banner shown when the signed-in user was issued a temporary
 * password (must_change_password). Lets them set a new password inline.
 */
export function PasswordChangePrompt() {
  const { user, refresh } = useAuth();
  const [open, setOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!user?.mustChangePassword || done) return null;

  async function submit() {
    if (newPassword !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
      });
      const body = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not change password.");
        return;
      }
      setDone(true);
      await refresh();
    } catch {
      setError("Could not change password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="alert"
      style={{
        background: "rgba(184,134,11,0.12)",
        borderBottom: "1px solid rgba(184,134,11,0.35)",
        padding: "0.6rem 1rem",
      }}
    >
      {!open ? (
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.85rem" }}>
            You are using a temporary password. Please set a new one.
          </span>
          <Button size="sm" variant="gold" onClick={() => setOpen(true)}>
            Change password
          </Button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="password"
            placeholder="New password (min 10)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            style={{ padding: "0.4rem 0.55rem" }}
          />
          <input
            type="password"
            placeholder="Confirm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            style={{ padding: "0.4rem 0.55rem" }}
          />
          <Button size="sm" variant="gold" onClick={() => void submit()} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
            Later
          </Button>
          {error ? (
            <span style={{ color: "var(--danger)", fontSize: "0.8rem" }}>{error}</span>
          ) : null}
        </div>
      )}
    </div>
  );
}
