"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { SortableTh } from "@/components/ui/SortableTh";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime } from "@/lib/format/dates";
import { useTableSort } from "@/lib/ui/table-sort";

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

  async function pollJob(jobId: string): Promise<"completed" | "failed" | "timeout"> {
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const res = await fetch(`/api/ai/jobs/${jobId}`, { credentials: "include" });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { job: { status: string; errorMessage?: string | null } };
      };
      const status = body.data?.job?.status;
      if (status === "completed") return "completed";
      if (status === "failed") {
        setError(body.data?.job?.errorMessage ?? "Background job failed.");
        return "failed";
      }
    }
    return "timeout";
  }

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
          async?: boolean;
          job?: { id: string };
          message?: string;
          stats?: PackStats;
          result?: {
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
      if ((!res.ok && res.status !== 202) || !body.ok || !body.data) {
        setError(body.error?.message ?? "Re-ingest failed.");
        return;
      }

      if (body.data.async && body.data.job?.id) {
        toast(body.data.message ?? "Job queued; waiting for embeddings…");
        setLastSteps([`Queued job ${body.data.job.id}`]);
        const outcome = await pollJob(body.data.job.id);
        if (outcome === "completed") {
          toast(mode === "all" ? "Knowledge re-ingest completed." : "Embedding completed.");
          await load();
        } else if (outcome === "timeout") {
          setError(
            "Job still running. Refresh later, or run `npm run jobs:ai` on a worker if needed.",
          );
        }
        return;
      }

      if (body.data.stats) setStats(body.data.stats);
      const steps = body.data.result?.steps ?? [];
      setLastSteps(steps.map((s) => `${s.ok ? "OK" : "FAIL"} ${s.step}: ${s.detail}`));

      if (mode === "all") {
        const embedded = body.data.result?.embeddings?.embedded ?? 0;
        const failed = body.data.result?.embeddings?.failed ?? 0;
        const chunks = body.data.result?.pack?.chunksWritten ?? 0;
        if (failed > 0 || body.data.result?.embeddings?.errorCode) {
          setError(
            body.data.result?.embeddings?.message ??
              "Pack loaded but embedding failed (check GEMINI_API_KEY).",
          );
        } else {
          toast(`Re-ingest complete: ${chunks} chunks, ${embedded} embeddings.`);
        }
      } else {
        const embedded = body.data.result?.embedded ?? 0;
        const failed = body.data.result?.failed ?? 0;
        if (failed > 0 || body.data.result?.errorCode) {
          setError(body.data.result?.message ?? "Embedding failed (check GEMINI_API_KEY).");
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

  const sources = stats?.sources ?? [];
  const sourceAccessors = useMemo(
    () => ({
      source: (r: PackSource) => r.title,
      type: (r: PackSource) => r.sourceType,
      ingested: (r: PackSource) => r.ingestedAt,
    }),
    [],
  );
  const { sortedRows, sortKey, sortDir, toggleSort } = useTableSort(sources, sourceAccessors, {
    key: "source",
    dir: "asc",
  });

  return (
    <div className="settings-form">
      <div className="settings-form-head">
        <Badge tone={stats?.embeddingsReady ? "open" : "pending"}>
          {stats?.embeddingsReady ? "Embeddings ready" : "Starter / demo"}
        </Badge>
        {loading ? <span className="muted">Loading…</span> : null}
        <p className="settings-lede">
          System knowledge pack for RAG (Zimbabwe only). Re-ingest reloads the starter pack, chunks
          to ~500 to 800 tokens with overlap, then embeds with Gemini into pgvector. See
          docs/KNOWLEDGE_BASE.md and docs/AI.md.
        </p>
        {error ? (
          <p style={{ color: "var(--danger)", margin: 0 }} role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <section className="settings-section">
        <h3 className="settings-section-title">Pack stats</h3>
        <div className="settings-stat-grid">
          <div className="settings-stat">
            <div className="settings-label">Pack version</div>
            <div className="settings-stat-value">{stats?.packVersion ?? "—"}</div>
          </div>
          <div className="settings-stat">
            <div className="settings-label">Starter sources</div>
            <div className="settings-stat-value">{stats?.starterPackSourceCount ?? 0}</div>
          </div>
          <div className="settings-stat">
            <div className="settings-label">System chunks</div>
            <div className="settings-stat-value">{stats?.systemChunkCount ?? 0}</div>
          </div>
          <div className="settings-stat">
            <div className="settings-label">Embeddings</div>
            <div className="settings-stat-value">{stats?.embeddingCount ?? 0}</div>
          </div>
        </div>
        {stats?.embeddingsModel ? (
          <p className="settings-hint">Embeddings model: {stats.embeddingsModel}</p>
        ) : null}
      </section>

      <section className="settings-section">
        <h3 className="settings-section-title">Sources</h3>
        {stats?.sources?.length ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <SortableTh label="Source" columnKey="source" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                  <SortableTh label="Type" columnKey="type" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                  <SortableTh label="Ingested" columnKey="ingested" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((s) => (
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
          <p className="settings-hint">No starter pack loaded yet. Click Re-ingest knowledge pack.</p>
        )}

        {lastSteps.length > 0 ? (
          <ul className="muted" style={{ margin: 0, paddingLeft: "1.1rem", fontSize: "0.8rem" }}>
            {lastSteps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <div className="settings-actions">
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
  );
}
