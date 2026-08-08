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
      <div style={{ display: "grid", gap: "1rem", maxWidth: "42rem" }}>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Licence</h2>
          {licence ? (
            <Badge tone={statusTone(licence.status)}>{licence.status}</Badge>
          ) : null}
        </div>

        <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
          SaaS activation for this firm. Edition flags and seats are described in docs/EDITIONS.md.
          Export is never disabled by licence status.
        </p>

        {error ? (
          <p style={{ color: "var(--danger)", margin: 0, fontSize: "0.9rem" }}>{error}</p>
        ) : null}

        {loading ? <p className="muted">Loading…</p> : null}

        {licence && !loading ? (
          <div
            style={{
              display: "grid",
              gap: "0.65rem",
              padding: "0.85rem 1rem",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              background: "var(--bg-1)",
              fontSize: "0.9rem",
            }}
          >
            <div>
              <span className="muted">Edition: </span>
              <strong style={{ textTransform: "capitalize" }}>{licence.edition}</strong>
            </div>
            <div>
              <span className="muted">Seats: </span>
              {usage
                ? `${usage.seatsUsed} used / ${usage.seats} (${usage.seatsRemaining} remaining)`
                : licence.seats}
            </div>
            <div>
              <span className="muted">Matters: </span>
              {usage
                ? usage.maxMatters === null
                  ? `${usage.mattersUsed} (unlimited)`
                  : `${usage.mattersUsed} / ${usage.maxMatters} cap`
                : licence.maxMatters === null
                  ? "Unlimited"
                  : `Cap ${licence.maxMatters}`}
            </div>
            <div>
              <span className="muted">Issued: </span>
              {formatDateTime(licence.issuedAt)}
            </div>
            <div>
              <span className="muted">Expires: </span>
              {licence.expiresAt ? formatDateTime(licence.expiresAt) : "No expiry"}
            </div>
            {licence.notes ? (
              <div>
                <span className="muted">Notes: </span>
                {licence.notes}
              </div>
            ) : null}
            {licence.reason ? (
              <p style={{ margin: 0, color: "var(--danger)", fontSize: "0.85rem" }}>
                {licence.reason}
              </p>
            ) : null}
            <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>
              New matters blocked: {licence.blocksNewMatters ? "yes" : "no"}. Export allowed:{" "}
              {licence.exportAllowed ? "yes (always)" : "no"}.
              {usage?.aiProxyEligible ? " AI proxy eligible." : " AI proxy not on this edition."}
            </p>
          </div>
        ) : null}

        {featureEntries.length > 0 ? (
          <div
            style={{
              display: "grid",
              gap: "0.35rem",
              fontSize: "0.85rem",
            }}
          >
            <strong>Features</strong>
            {featureEntries.map(([key, on]) => (
              <div key={key} className="muted">
                {key}: {on ? "on" : "off"}
              </div>
            ))}
          </div>
        ) : null}

        {policy ? (
          <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>
            Policy: {policy}
          </p>
        ) : null}

        <div>
          <Button variant="ghost" onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
        </div>
      </div>
    </Can>
  );
}
