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

type Candidate = {
  chunkId: string;
  title: string;
  headingPath: string | null;
  score: number;
  excerpt: string;
  aboveThreshold: boolean;
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
  const [candidates, setCandidates] = useState<Candidate[]>([]);

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
          diagnostic?: { candidates: Candidate[] } | null;
        };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Retrieval failed.");
        return;
      }
      setHits(body.data.hits);
      setMeta(body.data.retrievalMeta);
      setCandidates(body.data.diagnostic?.candidates ?? []);
      toast(
        body.data.retrievalMeta.empty
          ? "No hits above threshold."
          : `Retrieved ${body.data.retrievalMeta.hitCount} hit(s).`,
      );
    } catch {
      setError("Retrieval failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="settings-form">
      <div className="settings-form-head">
        <Badge tone={meta?.empty === false ? "open" : "pending"}>
          {meta ? (meta.empty ? "Empty" : "Hits") : "Preview"}
        </Badge>
        <p className="settings-lede">
          Embeds the query and searches pgvector. No LLM answer yet (P2-07). Requires embeddings
          from Knowledge pack re-ingest.
        </p>
        {error ? (
          <p style={{ color: "var(--danger)", margin: 0 }} role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <section className="settings-section">
        <h3 className="settings-section-title">Test query</h3>
        <label className="settings-field">
          <span>Query</span>
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
            {loading ? "Retrieving…" : "Retrieve context"}
          </Button>
        </div>
        {meta ? (
          <p className="settings-hint">
            hits={meta.hitCount} candidates={meta.candidateCount} minSimilarity={meta.minSimilarity}{" "}
            model={meta.embeddingsModel} latency={meta.latencyMs}ms
            {meta.emptyReason ? ` emptyReason=${meta.emptyReason}` : ""}
            {meta.errorCode ? ` error=${meta.errorCode}` : ""}
          </p>
        ) : null}
      </section>

      {hits.length > 0 ? (
        <section className="settings-section">
          <h3 className="settings-section-title">Hits</h3>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Score</th>
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

      {candidates.length > 0 ? (
        <section className="settings-section">
          <h3 className="settings-section-title">Diagnostic candidates</h3>
          <ul className="muted" style={{ margin: 0, paddingLeft: "1.1rem", fontSize: "0.8rem" }}>
            {candidates.map((c) => (
              <li key={c.chunkId}>
                {c.score.toFixed(3)} {c.aboveThreshold ? "[pass]" : "[below]"} {c.title}
                {c.headingPath ? ` / ${c.headingPath}` : ""}: {c.excerpt}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
