"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";

type FirmMemoryStats = {
  firmId: string;
  matterCount: number;
  embeddingCount: number;
  mattersIndexed: number;
  embeddingsReady: boolean;
};

type MatterOption = { id: string; title: string; matterNumber: string | null };

export function FirmMemoryPanel() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<FirmMemoryStats | null>(null);
  const [matters, setMatters] = useState<MatterOption[]>([]);
  const [matterId, setMatterId] = useState("");
  const [query, setQuery] = useState("hearing");
  const [retrieveOut, setRetrieveOut] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, mattersRes] = await Promise.all([
        fetch("/api/ai/firm-memory", { credentials: "include" }),
        fetch("/api/matters?bucket=all", { credentials: "include" }),
      ]);
      const statsBody = (await statsRes.json()) as {
        ok: boolean;
        data?: FirmMemoryStats;
        error?: { message: string };
      };
      if (!statsRes.ok || !statsBody.ok || !statsBody.data) {
        setError(statsBody.error?.message ?? "Could not load firm memory stats.");
        return;
      }
      setStats(statsBody.data);

      if (mattersRes.ok) {
        const mBody = (await mattersRes.json()) as {
          ok?: boolean;
          data?: { items?: MatterOption[] };
        };
        const list = mBody.data?.items ?? [];
        setMatters(
          list.map((m) => ({
            id: m.id,
            title: m.title,
            matterNumber: m.matterNumber ?? null,
          })),
        );
        if (!matterId && list[0]?.id) setMatterId(list[0].id);
      }
    } catch {
      setError("Could not load firm memory stats.");
    } finally {
      setLoading(false);
    }
  }, [matterId]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  async function runReindex(action: "reindex_matter" | "reindex_all") {
    setBusy(true);
    setError(null);
    setRetrieveOut(null);
    try {
      const res = await fetch("/api/ai/firm-memory", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "reindex_matter" ? { action, matterId } : { action },
        ),
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: {
          async?: boolean;
          job?: { id: string };
          message?: string;
          stats?: FirmMemoryStats;
          result?: {
            embedded?: number;
            failed?: number;
            message?: string;
            errorCode?: string;
          };
        };
        error?: { message: string };
      };
      if ((!res.ok && res.status !== 202) || !body.ok || !body.data) {
        setError(body.error?.message ?? "Reindex failed.");
        return;
      }

      if (body.data.async && body.data.job?.id) {
        toast(body.data.message ?? "Firm memory reindex queued…");
        for (let i = 0; i < 60; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          const jRes = await fetch(`/api/ai/jobs/${body.data!.job!.id}`, {
            credentials: "include",
          });
          const jBody = (await jRes.json()) as {
            ok: boolean;
            data?: { job: { status: string; errorMessage?: string | null } };
          };
          const status = jBody.data?.job?.status;
          if (status === "completed") {
            toast("Firm memory reindex completed.");
            await load();
            return;
          }
          if (status === "failed") {
            setError(jBody.data?.job?.errorMessage ?? "Reindex job failed.");
            return;
          }
        }
        setError("Job still running. Refresh later or run npm run jobs:ai.");
        return;
      }

      if (body.data.stats) setStats(body.data.stats);
      const failed = body.data.result?.failed ?? 0;
      if (failed > 0 || body.data.result?.errorCode) {
        setError(body.data.result?.message ?? "Reindex reported failures.");
      } else {
        toast(
          action === "reindex_all"
            ? "Firm memory reindex complete."
            : `Matter reindexed (${body.data.result?.embedded ?? 0} embeddings).`,
        );
      }
    } catch {
      setError("Reindex failed.");
    } finally {
      setBusy(false);
    }
  }

  async function runRetrieve() {
    if (!matterId || !query.trim()) return;
    setBusy(true);
    setError(null);
    setRetrieveOut(null);
    try {
      const res = await fetch("/api/ai/firm-memory/retrieve", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matterId, query: query.trim() }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: {
          hits: Array<{ citationLabel: string; score: number; text: string }>;
          retrievalMeta: { hitCount: number; emptyReason: string | null };
        };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Retrieve failed.");
        return;
      }
      const lines = [
        `hits=${body.data.retrievalMeta.hitCount} emptyReason=${body.data.retrievalMeta.emptyReason ?? "—"}`,
        ...body.data.hits.map(
          (h, i) =>
            `${i + 1}. [${h.score.toFixed(3)}] ${h.citationLabel}: ${h.text.slice(0, 120)}`,
        ),
      ];
      setRetrieveOut(lines.join("\n"));
    } catch {
      setError("Retrieve failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-form">
      <div className="settings-form-head">
        {stats ? (
          <Badge tone={stats.embeddingsReady ? "open" : "pending"}>
            {stats.embeddingsReady ? "Indexed" : "Empty"}
          </Badge>
        ) : null}
        {loading ? <span className="muted">Loading…</span> : null}
        <p className="settings-lede">
          Embed matter summaries, timeline notes, and document metadata for Matter Assist.
          Retrieval is always scoped to one matter (RBAC enforced). Full document text extraction
          is not included yet.
        </p>
        {error ? (
          <p style={{ color: "var(--danger)", margin: 0 }} role="alert">
            {error}
          </p>
        ) : null}
      </div>

      {stats ? (
        <section className="settings-section">
          <h3 className="settings-section-title">Index status</h3>
          <div className="settings-stat-grid">
            <div className="settings-stat">
              <div className="settings-label">Matters indexed</div>
              <div className="settings-stat-value">
                {stats.mattersIndexed}/{stats.matterCount}
              </div>
            </div>
            <div className="settings-stat">
              <div className="settings-label">Embeddings</div>
              <div className="settings-stat-value">{stats.embeddingCount}</div>
            </div>
          </div>
        </section>
      ) : null}

      <section className="settings-section">
        <h3 className="settings-section-title">Re-index</h3>
        <div className="settings-fields cols-2">
          <label className="settings-field">
            <span>Matter</span>
            <select
              className="input"
              value={matterId}
              onChange={(e) => setMatterId(e.target.value)}
              disabled={busy || matters.length === 0}
            >
              {matters.length === 0 ? <option value="">No matters</option> : null}
              {matters.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.matterNumber ? `${m.matterNumber} · ` : ""}
                  {m.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="settings-actions">
          <Button
            variant="gold"
            size="sm"
            disabled={busy || !matterId}
            onClick={() => void runReindex("reindex_matter")}
          >
            Re-index matter
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void runReindex("reindex_all")}
          >
            Re-index all (MP)
          </Button>
        </div>
      </section>

      <section className="settings-section">
        <h3 className="settings-section-title">Test retrieval</h3>
        <div className="settings-inline-form">
          <label className="settings-field" style={{ flex: 1, minWidth: "12rem" }}>
            <span>Test retrieve query</span>
            <input
              className="input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={busy}
            />
          </label>
          <Button
            variant="outline"
            size="sm"
            disabled={busy || !matterId}
            onClick={() => void runRetrieve()}
          >
            Retrieve
          </Button>
        </div>

        {retrieveOut ? <pre className="settings-pre">{retrieveOut}</pre> : null}
      </section>
    </div>
  );
}
