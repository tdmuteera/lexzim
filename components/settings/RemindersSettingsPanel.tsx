"use client";

import { useCallback, useEffect, useState } from "react";
import { Can } from "@/components/auth/Can";
import { Button } from "@/components/ui/Button";

export function RemindersSettingsPanel() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [perm, setPerm] = useState<string>("unsupported");
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reminders/settings", { credentials: "include" });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { browserNotificationsEnabled: boolean };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Could not load reminder settings.");
        return;
      }
      setEnabled(body.data.browserNotificationsEnabled);
    } catch {
      setError("Could not load reminder settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    if (typeof window !== "undefined" && "Notification" in window) {
      setPerm(Notification.permission);
    }
  }, [load]);

  async function save(next: boolean) {
    setSaving(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch("/api/reminders/settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ browserNotificationsEnabled: next }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { browserNotificationsEnabled: boolean };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Could not save.");
        return;
      }
      setEnabled(body.data.browserNotificationsEnabled);
      setMsg("Saved.");
    } catch {
      setError("Could not save.");
    } finally {
      setSaving(false);
    }
  }

  async function requestBrowserPermission() {
    setMsg(null);
    if (!("Notification" in window)) {
      setError("This browser does not support notifications.");
      return;
    }
    const result = await Notification.requestPermission();
    setPerm(result);
    if (result === "granted") {
      setMsg("Browser permission granted. Alerts only fire while LexZim is open.");
    } else {
      setError("Permission not granted.");
    }
  }

  return (
    <div className="settings-form">
      <div className="settings-form-head">
        <p className="settings-lede">
          In-app reminders centre lists overdue procedures/deadlines and upcoming hearings. Email
          and mobile push are out of scope. Optional browser notifications only work while this tab
          is open.
        </p>
        {error ? (
          <p role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem" }}>
            {error}
          </p>
        ) : null}
        {msg ? <p className="settings-hint">{msg}</p> : null}
      </div>

      <section className="settings-section">
        <h3 className="settings-section-title">Browser notifications</h3>
        {loading ? (
          <p className="muted" style={{ fontSize: "0.85rem" }}>
            Loading…
          </p>
        ) : (
          <Can
            permission="settings.manage"
            fallback={
              <p className="settings-hint">
                Firm browser alerts: {enabled ? "on" : "off"}. Ask a managing partner to change
                this.
              </p>
            }
          >
            <label className="settings-check">
              <input
                type="checkbox"
                checked={enabled}
                disabled={saving}
                onChange={(e) => void save(e.target.checked)}
              />
              <span>Allow browser notifications while LexZim is open</span>
            </label>
          </Can>
        )}

        <div className="settings-summary" style={{ marginTop: "0.25rem" }}>
          <div className="settings-summary-row">
            <span className="settings-label">Browser permission</span>
            <span className="settings-value" style={{ textTransform: "capitalize" }}>
              {perm}
            </span>
          </div>
        </div>
        <div className="settings-actions">
          <Button size="sm" variant="outline" onClick={() => void requestBrowserPermission()}>
            Request browser permission
          </Button>
        </div>
      </section>
    </div>
  );
}
