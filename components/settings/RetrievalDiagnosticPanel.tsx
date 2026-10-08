"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";

type Hit = {
  chunkId: string;
  title: string;
  citationLabel: string;
  headingPath: string | null;
  score: number;
  text: string;
};

type Meta = {
  empty: boolean;
  emptyReason: string | null;
  hitCount: number;
  candidateCount: number;
  minSimilarity: number;
  latencyMs: number;
  embeddingsModel: string;
  errorCode?: string;
};

/** Managing Partner diagnostic preview for RAG retrieval (no LLM answer). */
export function RetrievalDiagnosticPanel() {
  const { toast } = useToast();
  const [query, setQuery] = useState("unfair dismissal labour zimbabwe");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [hits, setHits] = useState<Hit[]>([]);

  async function onRetrieve() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/retrieve", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, diagnostic: true }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: {
          hits: Hit[];
          retrievalMeta: Meta;
        };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Could not check sources.");
        return;
      }
      setHits(body.data.hits);
      setMeta(body.data.retrievalMeta);
      toast(
        body.data.retrievalMeta.empty
          ? "No sources matched."
          : `Found ${body.data.retrievalMeta.hitCount} source${body.data.retrievalMeta.hitCount === 1 ? "" : "s"}.`,
      );
    } catch {
      setError("Could not check sources.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="settings-form">
      <div className="settings-form-head">
        <Badge tone={meta?.empty === false ? "open" : "pending"}>
          {meta ? (meta.empty ? "None" : "Sources") : "Preview"}
        </Badge>
        <p className="settings-lede">
          Try a question and see which sources the assistant would use. This does not write an
          answer. The knowledge pack needs to be ready first.
        </p>
        {error ? (
          <p style={{ color: "var(--danger)", margin: 0 }} role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <section className="settings-section">
        <h3 className="settings-section-title">Question</h3>
        <label className="settings-field">
          <span>Question</span>
          <textarea
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            rows={3}
            style={{ resize: "vertical" }}
          />
        </label>
        <div className="settings-actions">
          <Button variant="gold" onClick={() => void onRetrieve()} disabled={loading || !query.trim()}>
            {loading ? "Looking…" : "See sources"}
          </Button>
        </div>
        {meta ? (
          <p className="settings-hint">
            {meta.empty
              ? "No sources matched that question."
              : `${meta.hitCount} source${meta.hitCount === 1 ? "" : "s"} matched.`}
          </p>
        ) : null}
      </section>

      {hits.length > 0 ? (
        <section className="settings-section">
          <h3 className="settings-section-title">Sources</h3>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Match</th>
                  <th>Source</th>
                  <th>Excerpt</th>
                </tr>
              </thead>
              <tbody>
                {hits.map((h) => (
                  <tr key={h.chunkId}>
                    <td>{h.score.toFixed(3)}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{h.title}</div>
                      <div className="muted" style={{ fontSize: "0.75rem" }}>
                        {h.headingPath}
                      </div>
                    </td>
                    <td style={{ fontSize: "0.8rem" }}>
                      {h.text.slice(0, 160)}
                      {h.text.length > 160 ? "…" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
