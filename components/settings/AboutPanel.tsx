"use client";

import { useCallback, useEffect, useState } from "react";
import { Can } from "@/components/auth/Can";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatDateTime } from "@/lib/format/dates";

type AboutData = {
  app: {
    name: string;
    version: string;
    channel: string;
    releaseNotes: string;
    releasingDoc: string;
  };
  firm: { id: string; name: string; slug: string };
  licence: {
    edition: string;
    seats: number;
    status: string;
    expiresAt: string | null;
    isActive: boolean;
    exportAllowed: boolean;
  };
  usage: {
    seats: number;
    seatsUsed: number;
    edition: string;
    aiProxyEligible: boolean;
  };
  knowledge: {
    packVersion: string;
    starterPackId: string;
    quality: string | null;
    systemChunkCount: number;
    embeddingCount: number;
    embeddingsReady: boolean;
  };
  note: string;
};

export function AboutPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AboutData | null>(null);
  const [diagBusy, setDiagBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/about", { credentials: "include" });
      const body = (await res.json()) as {
        ok: boolean;
        data?: AboutData;
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Could not load About.");
        return;
      }
      setData(body.data);
    } catch {
      setError("Could not load About.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const downloadDiagnostics = async () => {
    setDiagBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/diagnostics", { credentials: "include" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(body?.error?.message ?? "Could not download diagnostics.");
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(cd);
      const filename = match?.[1] ?? "lexzim-diagnostics.json";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not download diagnostics.");
    } finally {
      setDiagBusy(false);
    }
  };

  return (
    <Can permission="settings.manage">
      <div className="settings-form">
        <div className="settings-form-head">
          {data ? <Badge tone="open">v{data.app.version}</Badge> : null}
          {loading ? <span className="muted">Loading…</span> : null}
          <p className="settings-lede">
            App version, firm licence, and knowledge pack for this deployment. LexZim is hosted
            SaaS: there is no desktop updater.
          </p>
          {error ? (
            <p style={{ color: "var(--danger)", margin: 0, fontSize: "0.9rem", width: "100%" }}>
              {error}
            </p>
          ) : null}
        </div>

        {data && !loading ? (
          <>
            <section className="settings-section">
              <h3 className="settings-section-title">Deployment</h3>
              <div className="settings-summary">
                <div className="settings-summary-row">
                  <span className="settings-label">Product</span>
                  <span className="settings-value">{data.app.name}</span>
                </div>
                <div className="settings-summary-row">
                  <span className="settings-label">App version</span>
                  <span className="settings-value">
                    {data.app.version}
                    {data.app.channel ? ` (${data.app.channel})` : ""}
                  </span>
                </div>
                <div className="settings-summary-row">
                  <span className="settings-label">Firm</span>
                  <span className="settings-value">
                    {data.firm.name} ({data.firm.slug})
                  </span>
                </div>
              </div>
            </section>

            <section className="settings-section">
              <h3 className="settings-section-title">Licence & usage</h3>
              <div className="settings-summary">
                <div className="settings-summary-row">
                  <span className="settings-label">Edition</span>
                  <span className="settings-value" style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                    <span style={{ textTransform: "capitalize" }}>{data.licence.edition}</span>
                    <Badge tone={data.licence.isActive ? "open" : "pending"}>
                      {data.licence.status}
                    </Badge>
                  </span>
                </div>
                <div className="settings-summary-row">
                  <span className="settings-label">Seats</span>
                  <span className="settings-value">
                    {data.usage.seatsUsed} / {data.usage.seats}
                    {data.usage.aiProxyEligible ? " · AI proxy eligible" : ""}
                  </span>
                </div>
                <div className="settings-summary-row">
                  <span className="settings-label">Licence expires</span>
                  <span className="settings-value">
                    {data.licence.expiresAt ? formatDateTime(data.licence.expiresAt) : "No expiry"}
                  </span>
                </div>
              </div>
            </section>

            <section className="settings-section">
              <h3 className="settings-section-title">Knowledge pack</h3>
              <div className="settings-stat-grid">
                <div className="settings-stat">
                  <div className="settings-label">Pack version</div>
                  <div className="settings-stat-value">{data.knowledge.packVersion}</div>
                </div>
                <div className="settings-stat">
                  <div className="settings-label">KB chunks</div>
                  <div className="settings-stat-value">{data.knowledge.systemChunkCount}</div>
                </div>
                <div className="settings-stat">
                  <div className="settings-label">Embeddings</div>
                  <div className="settings-stat-value">{data.knowledge.embeddingCount}</div>
                </div>
                <div className="settings-stat">
                  <div className="settings-label">Status</div>
                  <div className="settings-stat-value">
                    <Badge tone={data.knowledge.embeddingsReady ? "open" : "pending"}>
                      {data.knowledge.embeddingsReady ? "Ready" : "Not ready"}
                    </Badge>
                  </div>
                </div>
              </div>
              {data.knowledge.quality ? (
                <p className="settings-hint">Quality: {data.knowledge.quality}</p>
              ) : null}
            </section>

            <p className="settings-hint">
              Release notes: repo file <code>{data.app.releaseNotes}</code>. Deploy checklist:{" "}
              <code>{data.app.releasingDoc}</code>.
            </p>
            <p className="settings-hint">{data.note} Export remains available if a licence expires.</p>
            <p className="settings-hint">
              Diagnostics include version, firm id, and edition only. No matter contents. Nothing is
              uploaded automatically; you choose whether to attach the file to a support ticket.
            </p>
          </>
        ) : null}

        <div className="settings-actions">
          <Button variant="ghost" onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
          <Button
            variant="outline"
            onClick={() => void downloadDiagnostics()}
            disabled={diagBusy || loading}
          >
            {diagBusy ? "Preparing…" : "Download diagnostics"}
          </Button>
        </div>
      </div>
    </Can>
  );
}
