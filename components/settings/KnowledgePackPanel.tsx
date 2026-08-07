"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime } from "@/lib/format/dates";

type PackSource = {
  id: string;
  title: string;
  citationLabel: string;
  sourceType: string;
  ingestedAt: string | null;
};

type PackStats = {
  packVersion: string;
  quality: string;
  systemSourceCount: number;
  systemChunkCount: number;
  starterPackSourceCount: number;
  embeddingCount?: number;
  embeddingsModel?: string;
  embeddingsReady: boolean;
  sources: PackSource[];
};

export function KnowledgePackPanel() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [reingesting, setReingesting] = useState(false);
  const [embeddingOnly, setEmbeddingOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<PackStats | null>(null);
  const [lastSteps, setLastSteps] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/knowledge", { credentials: "include" });
      const body = (await res.json()) as {
        ok: boolean;
        data?: PackStats;
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Could not load knowledge pack status.");
        return;
      }
      setStats(body.data);
    } catch {
      setError("Could not load knowledge pack status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function runIngest(mode: "all" | "embed") {
    if (mode === "all") setReingesting(true);
    else setEmbeddingOnly(true);
    setError(null);
    setLastSteps([]);
    try {
      const res = await fetch("/api/ai/knowledge", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: {
          stats: PackStats;
          result: {
            pack?: { chunksWritten: number };
            embeddings?: {
              embedded: number;
              failed: number;
              message?: string;
              errorCode?: string;
            };
            chunksWritten?: number;
            embedded?: number;
            failed?: number;
            message?: string;
            errorCode?: string;
            steps?: Array<{ step: string; ok: boolean; detail: string }>;
          };
        };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Re-ingest failed.");
        return;
      }
      setStats(body.data.stats);
      const steps = body.data.result.steps ?? [];
      setLastSteps(steps.map((s) => `${s.ok ? "OK" : "FAIL"} ${s.step}: ${s.detail}`));

      if (mode === "all") {
        const embedded = body.data.result.embeddings?.embedded ?? 0;
        const failed = body.data.result.embeddings?.failed ?? 0;
        const chunks = body.data.result.pack?.chunksWritten ?? 0;
        if (failed > 0 || body.data.result.embeddings?.errorCode) {
          setError(
            body.data.result.embeddings?.message ??
              "Pack loaded but embedding failed (check GEMINI_API_KEY).",
          );
        } else {
          toast(`Re-ingest complete: ${chunks} chunks, ${embedded} embeddings.`);
        }
      } else {
        const embedded = body.data.result.embedded ?? 0;
        const failed = body.data.result.failed ?? 0;
        if (failed > 0 || body.data.result.errorCode) {
          setError(body.data.result.message ?? "Embedding failed (check GEMINI_API_KEY).");
        } else {
          toast(`Embedded ${embedded} chunks.`);
        }
      }
    } catch {
      setError("Re-ingest failed.");
    } finally {
      setReingesting(false);
      setEmbeddingOnly(false);
    }
  }

  return (
    <>
      <div className="panel-head">
        <h3>Zimbabwe knowledge pack</h3>
        <Badge tone={stats?.embeddingsReady ? "open" : "pending"}>
          {stats?.embeddingsReady ? "Embeddings ready" : "Starter / demo"}
        </Badge>
      </div>
      <div className="panel-body" style={{ display: "grid", gap: "1rem" }}>
        {loading ? <p className="muted">Loading…</p> : null}
        {error ? (
          <p style={{ color: "var(--danger)", margin: 0 }} role="alert">
            {error}
          </p>
        ) : null}

        <p className="muted" style={{ margin: 0, fontSize: "0.85rem", lineHeight: 1.45 }}>
          System knowledge pack for RAG (Zimbabwe only). Re-ingest reloads the starter pack, chunks
          to ~500–800 tokens with overlap, then embeds with Gemini into pgvector. See
          docs/KNOWLEDGE_BASE.md and docs/AI.md.
        </p>

        <div
          style={{
            display: "grid",
            gap: "0.75rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          }}
        >
          <div>
            <div className="muted" style={{ fontSize: "0.8rem" }}>
              Pack version
            </div>
            <div style={{ fontWeight: 600 }}>{stats?.packVersion ?? "—"}</div>
          </div>
          <div>
            <div className="muted" style={{ fontSize: "0.8rem" }}>
              Starter sources
            </div>
            <div style={{ fontWeight: 600 }}>{stats?.starterPackSourceCount ?? 0}</div>
          </div>
          <div>
            <div className="muted" style={{ fontSize: "0.8rem" }}>
              System chunks
            </div>
            <div style={{ fontWeight: 600 }}>{stats?.systemChunkCount ?? 0}</div>
          </div>
          <div>
            <div className="muted" style={{ fontSize: "0.8rem" }}>
              Embeddings
            </div>
            <div style={{ fontWeight: 600 }}>
              {stats?.embeddingCount ?? 0}
              {stats?.embeddingsModel ? ` (${stats.embeddingsModel})` : ""}
            </div>
          </div>
        </div>

        {stats?.sources?.length ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Type</th>
                  <th>Ingested</th>
                </tr>
              </thead>
              <tbody>
                {stats.sources.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{s.title}</div>
                      <div className="muted" style={{ fontSize: "0.75rem" }}>
                        {s.citationLabel}
                      </div>
                    </td>
                    <td>{s.sourceType}</td>
                    <td>{formatDateTime(s.ingestedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            No starter pack loaded yet. Click Re-ingest knowledge pack.
          </p>
        )}

        {lastSteps.length > 0 ? (
          <ul className="muted" style={{ margin: 0, paddingLeft: "1.1rem", fontSize: "0.8rem" }}>
            {lastSteps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        ) : null}

        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <Button
            variant="gold"
            onClick={() => void runIngest("all")}
            disabled={reingesting || embeddingOnly || loading}
          >
            {reingesting ? "Re-ingesting…" : "Re-ingest knowledge pack"}
          </Button>
          <Button
            variant="outline"
            onClick={() => void runIngest("embed")}
            disabled={reingesting || embeddingOnly || loading}
          >
            {embeddingOnly ? "Embedding…" : "Embed chunks only"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => void load()}
            disabled={loading || reingesting || embeddingOnly}
          >
            Refresh counts
          </Button>
        </div>
      </div>
    </>
  );
}
