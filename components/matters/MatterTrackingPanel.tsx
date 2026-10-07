"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Can } from "@/components/auth/Can";
import { Button } from "@/components/ui/Button";

type TrackingItem = {
  id: string;
  summary: string;
  happensOn: string;
  happensOnLabel: string;
  createdByName: string | null;
  createdAt: string;
};

type MatterTrackingPanelProps = {
  matterId: string;
};

export function MatterTrackingPanel({ matterId }: MatterTrackingPanelProps) {
  const [items, setItems] = useState<TrackingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState("");
  const [happensOn, setHappensOn] = useState("");
  const [showEarlier, setShowEarlier] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/matters/${matterId}/tracking`, { credentials: "include" });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { items: TrackingItem[] };
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not load matter tracking.");
        setItems([]);
        return;
      }
      setItems(body.data?.items ?? []);
    } catch {
      setError("Could not load matter tracking.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [matterId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/matters/${matterId}/tracking`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ summary, happensOn }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { items: TrackingItem[] };
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not save this update.");
        return;
      }
      setItems(body.data?.items ?? []);
      setSummary("");
      setHappensOn("");
    } catch {
      setError("Could not save this update.");
    } finally {
      setSaving(false);
    }
  }

  const current = items[0] ?? null;
  const earlier = items.slice(1);

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: "8px",
        padding: "0.9rem 1rem",
        marginBottom: "1rem",
        background: "var(--bg-2)",
      }}
    >
      <h4 style={{ margin: "0 0 0.25rem" }}>Where this matter stands</h4>
      <p className="muted" style={{ margin: "0 0 0.75rem", fontSize: "0.85rem" }}>
        Write what is happening and the date. Anyone who opens this matter will see it, and
        Reminders will show it until that date has passed.
      </p>

      {error ? (
        <p role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem" }}>
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="muted" style={{ fontSize: "0.85rem" }}>
          Loading tracking…
        </p>
      ) : current ? (
        <p style={{ margin: "0 0 0.75rem", fontSize: "1rem" }}>
          <strong>{current.summary}</strong>
          {" on "}
          <strong>{current.happensOnLabel}</strong>
          <span className="muted" style={{ display: "block", fontSize: "0.8rem", marginTop: "0.2rem" }}>
            Entered {new Date(current.createdAt).toLocaleString()}
            {current.createdByName ? ` by ${current.createdByName}` : ""}
          </span>
        </p>
      ) : (
        <p className="muted" style={{ margin: "0 0 0.75rem", fontSize: "0.85rem" }}>
          Nothing recorded yet. For example: Pending hearing, 30 October.
        </p>
      )}

      <Can permission="matters.edit">
        <form onSubmit={onSave} className="grid-2" style={{ alignItems: "end" }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="tracking-summary">What is happening</label>
            <input
              id="tracking-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Waiting to file High Court papers"
              maxLength={240}
              required
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="tracking-date">Date</label>
            <input
              id="tracking-date"
              type="date"
              value={happensOn}
              onChange={(e) => setHappensOn(e.target.value)}
              required
            />
          </div>
          <div>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Saving…" : "Save this update"}
            </Button>
          </div>
        </form>
      </Can>

      {earlier.length > 0 ? (
        <div style={{ marginTop: "0.85rem" }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setShowEarlier((open) => !open)}
          >
            {showEarlier ? "Hide earlier updates" : `Earlier updates (${earlier.length})`}
          </button>
          {showEarlier ? (
            <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.1rem", fontSize: "0.85rem" }}>
              {earlier.map((item) => (
                <li key={item.id} style={{ marginBottom: "0.35rem" }}>
                  {item.summary} on {item.happensOnLabel}
                  <span className="muted">
                    {" "}
                    ({new Date(item.createdAt).toLocaleDateString()}
                    {item.createdByName ? `, ${item.createdByName}` : ""})
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
