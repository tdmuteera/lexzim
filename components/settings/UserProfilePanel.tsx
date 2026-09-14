"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";

type ProfileData = {
  fullName: string;
  email: string;
  jobTitle: string | null;
  communicationEmail?: string | null;
};

export function UserProfilePanel() {
  const { refresh } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [communicationEmail, setCommunicationEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordOk, setPasswordOk] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/account/profile", { credentials: "include" });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { profile: ProfileData };
        error?: { message?: string };
      };
      if (!res.ok || !body.ok || !body.data?.profile) {
        setError(body.error?.message ?? "Could not load your profile.");
        return;
      }
      setFullName(body.data.profile.fullName);
      setEmail(body.data.profile.email);
      setJobTitle(body.data.profile.jobTitle ?? "");
      setCommunicationEmail(
        body.data.profile.communicationEmail ?? body.data.profile.email ?? "",
      );
    } catch {
      setError("Could not load your profile.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSave() {
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          email,
          jobTitle: jobTitle.trim() || null,
          communicationEmail: communicationEmail.trim() || null,
        }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        error?: { message?: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not save your profile.");
        return;
      }
      setOk("Profile saved.");
      await refresh();
    } catch {
      setError("Could not save your profile.");
    } finally {
      setSaving(false);
    }
  }

  async function onChangePassword() {
    setPasswordError(null);
    setPasswordOk(null);
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }
    if (!currentPassword) {
      setPasswordError("Enter your current password.");
      return;
    }
    setChangingPassword(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        error?: { message?: string };
      };
      if (!res.ok || !body.ok) {
        setPasswordError(body.error?.message ?? "Could not change password.");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordOk("Password updated.");
      await refresh();
    } catch {
      setPasswordError("Could not change password.");
    } finally {
      setChangingPassword(false);
    }
  }

  return (
    <div className="settings-form">
      <div className="settings-form-head">
        <p className="settings-lede">
          Manage how your account appears across the system, and change your password whenever you
          need to.
        </p>
        {loading ? <span className="muted">Loading…</span> : null}
        {error ? <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p> : null}
        {ok ? <p style={{ color: "var(--ok)", margin: 0 }}>{ok}</p> : null}
      </div>

      <section className="settings-section">
        <h3 className="settings-section-title">Your profile</h3>
        <label>
          <span className="muted">Full name</span>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            disabled={loading || saving}
          />
        </label>
        <label>
          <span className="muted">Login email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading || saving}
          />
        </label>
        <label>
          <span className="muted">Job title</span>
          <input
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            placeholder="e.g. Partner, Bookkeeper"
            disabled={loading || saving}
          />
        </label>
        <label>
          <span className="muted">Notification email (tasks / approvals)</span>
          <input
            type="email"
            value={communicationEmail}
            onChange={(e) => setCommunicationEmail(e.target.value)}
            placeholder="Personal or work email for system notices"
            disabled={loading || saving}
          />
        </label>
        <p className="settings-hint" style={{ marginTop: 0 }}>
          Login email is what you use to sign in. Notification email is where LexZim sends task
          assignments and approval requests when firm SMTP is configured (personal or work). If
          blank, your login email is used. Client emails are never sent automatically.
        </p>
      </section>

      <div className="settings-actions">
        <Button variant="ghost" onClick={() => void load()} disabled={loading || saving}>
          Refresh
        </Button>
        <Button onClick={() => void onSave()} disabled={loading || saving}>
          {saving ? "Saving…" : "Save profile"}
        </Button>
      </div>

      <section className="settings-section">
        <h3 className="settings-section-title">Change password</h3>
        <p className="settings-hint">
          Any signed-in user, including Managing Partner, can update their password at any time.
          Minimum 10 characters.
        </p>
        {passwordError ? (
          <p style={{ color: "var(--danger)", margin: "0 0 0.75rem" }}>{passwordError}</p>
        ) : null}
        {passwordOk ? (
          <p style={{ color: "var(--ok)", margin: "0 0 0.75rem" }}>{passwordOk}</p>
        ) : null}
        <label>
          <span className="muted">Current password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            disabled={changingPassword}
          />
        </label>
        <label>
          <span className="muted">New password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            disabled={changingPassword}
          />
        </label>
        <label>
          <span className="muted">Confirm new password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={changingPassword}
          />
        </label>
        <div className="settings-actions">
          <Button
            onClick={() => void onChangePassword()}
            disabled={changingPassword || !currentPassword || !newPassword}
          >
            {changingPassword ? "Updating…" : "Update password"}
          </Button>
        </div>
      </section>
    </div>
  );
}
