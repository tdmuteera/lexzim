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
          stats: FirmMemoryStats;
          result: {
            embedded?: number;
            failed?: number;
            message?: string;
            errorCode?: string;
          };
        };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Re-index failed.");
        toast("Firm memory re-index failed.");
        return;
      }
      setStats(body.data.stats);
      toast(body.data.result.message ?? "Firm memory re-indexed.");
    } catch {
      setError("Re-index failed.");
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
    <div className="panel-body" style={{ display: "grid", gap: "0.85rem" }}>
      <div>
        <h3 style={{ margin: 0 }}>Firm memory</h3>
        <p className="muted" style={{ margin: "0.35rem 0 0" }}>
          Embed matter summaries, timeline notes, and document metadata for Matter Assist.
          Retrieval is always scoped to one matter (RBAC enforced). Full document text extraction
          is not included yet.
        </p>
      </div>

      {loading ? <p className="muted">Loading…</p> : null}
      {error ? (
        <p style={{ color: "var(--danger)", margin: 0 }} role="alert">
          {error}
        </p>
      ) : null}

      {stats ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
          <Badge tone={stats.embeddingsReady ? "open" : "pending"}>
            {stats.embeddingsReady ? "indexed" : "empty"}
          </Badge>
          <span className="muted" style={{ fontSize: "0.85rem" }}>
            {stats.mattersIndexed}/{stats.matterCount} matters · {stats.embeddingCount} embeddings
          </span>
        </div>
      ) : null}

      <label style={{ display: "grid", gap: "0.35rem", maxWidth: "28rem" }}>
        <span className="muted" style={{ fontSize: "0.8rem" }}>
          Matter
        </span>
        <select
          value={matterId}
          onChange={(e) => setMatterId(e.target.value)}
          disabled={busy || matters.length === 0}
          style={{
            padding: "0.45rem 0.6rem",
            border: "1px solid var(--border-2)",
            borderRadius: "var(--radius-sm)",
            background: "var(--bg-1)",
            color: "var(--text)",
          }}
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

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
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

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "end" }}>
        <label style={{ display: "grid", gap: "0.35rem", flex: 1, minWidth: "12rem" }}>
          <span className="muted" style={{ fontSize: "0.8rem" }}>
            Test retrieve query
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={busy}
            style={{
              padding: "0.45rem 0.6rem",
              border: "1px solid var(--border-2)",
              borderRadius: "var(--radius-sm)",
              background: "var(--bg-1)",
              color: "var(--text)",
            }}
          />
        </label>
        <Button variant="outline" size="sm" disabled={busy || !matterId} onClick={() => void runRetrieve()}>
          Retrieve
        </Button>
      </div>

      {retrieveOut ? (
        <pre
          style={{
            margin: 0,
            padding: "0.75rem",
            background: "var(--bg-3)",
            borderRadius: "var(--radius-sm)",
            fontSize: "0.78rem",
            whiteSpace: "pre-wrap",
          }}
        >
          {retrieveOut}
        </pre>
      ) : null}
    </div>
  );
}
