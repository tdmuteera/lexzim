"use client";

import { useCallback, useEffect, useState } from "react";
import { Can } from "@/components/auth/Can";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatDateTime } from "@/lib/format/dates";

type LicenceData = {
  firmId: string;
  edition: string;
  seats: number;
  maxMatters: number | null;
  features: Record<string, boolean>;
  status: string;
  issuedAt: string;
  expiresAt: string | null;
  notes: string | null;
  isActive: boolean;
  blocksNewMatters: boolean;
  exportAllowed: boolean;
  reason: string | null;
};

type UsageData = {
  seats: number;
  seatsUsed: number;
  seatsRemaining: number;
  mattersUsed: number;
  maxMatters: number | null;
  features: Record<string, boolean>;
  edition: string;
  aiProxyEligible: boolean;
};

function statusTone(status: string): "open" | "pending" | "closed" | "danger" {
  if (status === "active") return "open";
  if (status === "expired") return "pending";
  if (status === "revoked") return "danger";
  return "closed";
}

export function LicencePanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [licence, setLicence] = useState<LicenceData | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [policy, setPolicy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/licence", { credentials: "include" });
      const body = (await res.json()) as {
        ok: boolean;
        data?: {
          licence: LicenceData;
          usage?: UsageData;
          policy?: { onExpiry: string };
        };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Could not load licence.");
        return;
      }
      setLicence(body.data.licence);
      setUsage(body.data.usage ?? null);
      setPolicy(body.data.policy?.onExpiry ?? null);
    } catch {
      setError("Could not load licence.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const featureEntries = Object.entries(licence?.features ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return (
    <Can permission="settings.manage">
      <div className="settings-form">
        <div className="settings-form-head">
          {licence ? <Badge tone={statusTone(licence.status)}>{licence.status}</Badge> : null}
          {loading ? <span className="muted">Loading…</span> : null}
          <p className="settings-lede">
            This firm's licence: the edition, how many people can sign in, and when it runs to.
            A lapsed licence does not block a firm export.
          </p>
          {error ? (
            <p style={{ color: "var(--danger)", margin: 0, fontSize: "0.9rem" }}>{error}</p>
          ) : null}
        </div>

        {licence && !loading ? (
          <>
            <section className="settings-section">
              <h3 className="settings-section-title">Activation</h3>
              <div className="settings-summary">
                <div className="settings-summary-row">
                  <span className="settings-label">Edition</span>
                  <span className="settings-value" style={{ textTransform: "capitalize" }}>
                    {licence.edition}
                  </span>
                </div>
                <div className="settings-summary-row">
                  <span className="settings-label">Seats</span>
                  <span className="settings-value">
                    {usage
                      ? `${usage.seatsUsed} used / ${usage.seats} (${usage.seatsRemaining} remaining)`
                      : licence.seats}
                  </span>
                </div>
                <div className="settings-summary-row">
                  <span className="settings-label">Matters</span>
                  <span className="settings-value">
                    {usage
                      ? usage.maxMatters === null
                        ? `${usage.mattersUsed} (unlimited)`
                        : `${usage.mattersUsed} / ${usage.maxMatters} cap`
                      : licence.maxMatters === null
                        ? "Unlimited"
                        : `Cap ${licence.maxMatters}`}
                  </span>
                </div>
                <div className="settings-summary-row">
                  <span className="settings-label">Issued</span>
                  <span className="settings-value">{formatDateTime(licence.issuedAt)}</span>
                </div>
                <div className="settings-summary-row">
                  <span className="settings-label">Expires</span>
                  <span className="settings-value">
                    {licence.expiresAt ? formatDateTime(licence.expiresAt) : "No expiry"}
                  </span>
                </div>
              </div>

              {licence.notes ? <p className="settings-hint">Notes: {licence.notes}</p> : null}
              {licence.reason ? (
                <p style={{ margin: 0, color: "var(--danger)", fontSize: "0.85rem" }}>
                  {licence.reason}
                </p>
              ) : null}
              <p className="settings-hint">
                New matters blocked: {licence.blocksNewMatters ? "yes" : "no"}. Export allowed:{" "}
                {licence.exportAllowed ? "yes" : "no"}.
              </p>
            </section>

            {featureEntries.length > 0 ? (
              <section className="settings-section">
                <h3 className="settings-section-title">Features</h3>
                <div className="settings-chip-grid">
                  {featureEntries.map(([key, on]) => (
                    <div key={key} className={`settings-chip ${on ? "on" : ""}`}>
                      <span>{key.replace(/[._]/g, " ")}</span>
                      <strong>{on ? "On" : "Off"}</strong>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {policy ? <p className="settings-hint">Policy: {policy}</p> : null}
          </>
        ) : null}

        <div className="settings-actions">
          <Button variant="ghost" onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
        </div>
      </div>
    </Can>
  );
}
