"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/Button";

type ProfileData = {
  fullName: string;
  email: string;
  jobTitle: string | null;
};

export function UserProfilePanel() {
  const { refresh } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [jobTitle, setJobTitle] = useState("");

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

  return (
    <div className="settings-form">
      <div className="settings-form-head">
        <p className="settings-lede">
          Manage how your account appears across the system. Your chosen name is used in greetings.
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
          <span className="muted">Email (login)</span>
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
      </section>

      <div className="settings-actions">
        <Button variant="ghost" onClick={() => void load()} disabled={loading || saving}>
          Refresh
        </Button>
        <Button onClick={() => void onSave()} disabled={loading || saving}>
          {saving ? "Saving…" : "Save profile"}
        </Button>
      </div>
    </div>
  );
}
