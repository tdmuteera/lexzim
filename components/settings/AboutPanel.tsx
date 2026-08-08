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
      <div style={{ display: "grid", gap: "1rem", maxWidth: "42rem" }}>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: "1.1rem" }}>About</h2>
          {data ? <Badge tone="open">v{data.app.version}</Badge> : null}
        </div>

        <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
          App version, firm licence, and knowledge pack for this deployment. LexZim is hosted SaaS:
          there is no desktop updater.
        </p>

        {error ? (
          <p style={{ color: "var(--danger)", margin: 0, fontSize: "0.9rem" }}>{error}</p>
        ) : null}

        {loading ? <p className="muted">Loading…</p> : null}

        {data && !loading ? (
          <div
            style={{
              display: "grid",
              gap: "0.75rem",
              padding: "0.85rem 1rem",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              background: "var(--bg-1)",
              fontSize: "0.9rem",
            }}
          >
            <div>
              <span className="muted">Product: </span>
              <strong>{data.app.name}</strong>
            </div>
            <div>
              <span className="muted">App version: </span>
              {data.app.version}
              {data.app.channel ? (
                <span className="muted"> ({data.app.channel})</span>
              ) : null}
            </div>
            <div>
              <span className="muted">Firm: </span>
              {data.firm.name}{" "}
              <span className="muted">({data.firm.slug})</span>
            </div>
            <div>
              <span className="muted">Edition: </span>
              <strong style={{ textTransform: "capitalize" }}>{data.licence.edition}</strong>
              {" · "}
              <Badge tone={data.licence.isActive ? "open" : "pending"}>
                {data.licence.status}
              </Badge>
            </div>
            <div>
              <span className="muted">Seats: </span>
              {data.usage.seatsUsed} / {data.usage.seats}
              {data.usage.aiProxyEligible ? " · AI proxy eligible" : ""}
            </div>
            <div>
              <span className="muted">Licence expires: </span>
              {data.licence.expiresAt
                ? formatDateTime(data.licence.expiresAt)
                : "No expiry"}
            </div>
            <div>
              <span className="muted">Knowledge pack: </span>
              {data.knowledge.packVersion}
              {data.knowledge.embeddingsReady ? " · embeddings ready" : " · embeddings not ready"}
            </div>
            <div className="muted" style={{ fontSize: "0.8rem" }}>
              KB chunks: {data.knowledge.systemChunkCount} · embeddings:{" "}
              {data.knowledge.embeddingCount}
              {data.knowledge.quality ? ` · quality: ${data.knowledge.quality}` : ""}
            </div>
            <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>
              Release notes: repo file <code>{data.app.releaseNotes}</code>. Deploy checklist:{" "}
              <code>{data.app.releasingDoc}</code>.
            </p>
            <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>
              {data.note} Export remains available if a licence expires.
            </p>
            <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>
              Diagnostics include version, firm id, and edition only. No matter contents. Nothing is
              uploaded automatically; you choose whether to attach the file to a support ticket.
            </p>
          </div>
        ) : null}

        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
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
