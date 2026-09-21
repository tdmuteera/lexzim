"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Can } from "@/components/auth/Can";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SortableTh } from "@/components/ui/SortableTh";
import { useTableSort } from "@/lib/ui/table-sort";

type ConflictItem = {
  id: string;
  query: string;
  result: string;
  notes: string | null;
  checkedByName: string | null;
  checkedAt: string | null;
};

type Candidate = {
  kind: string;
  id: string;
  label: string;
  detail: string | null;
  partyRole: string | null;
};

function resultTone(result: string) {
  if (result === "clear") return "open" as const;
  if (result === "potential") return "pending" as const;
  if (result === "blocked") return "danger" as const;
  return "default" as const;
}

function resultLabel(result: string) {
  if (result === "clear") return "Clear";
  if (result === "potential") return "Potential";
  if (result === "blocked") return "Blocked";
  return result;
}

export function ConflictCheckPanel({
  clientId,
  highlight = false,
}: {
  clientId: string;
  highlight?: boolean;
}) {
  const [items, setItems] = useState<ConflictItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<"clear" | "potential" | "blocked">("clear");
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/conflict-checks`, {
        credentials: "include",
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { items: ConflictItem[] };
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not load conflict checks.");
        setItems([]);
        return;
      }
      setItems(body.data?.items ?? []);
    } catch {
      setError("Could not load conflict checks.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim().length < 2) {
      setError("Enter at least 2 characters to search.");
      return;
    }
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(`/api/conflict/search?q=${encodeURIComponent(q.trim())}`, {
        credentials: "include",
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { items: Candidate[] };
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Search failed.");
        setCandidates([]);
        return;
      }
      setCandidates(body.data?.items ?? []);
    } catch {
      setError("Search failed.");
      setCandidates([]);
    } finally {
      setSearching(false);
    }
  }

  async function onRecord(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/conflict-checks`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: q.trim() || "Manual conflict review",
          result,
          notes: notes.trim() || null,
        }),
      });
      const body = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not save conflict check.");
        return;
      }
      setNotes("");
      await load();
    } catch {
      setError("Could not save conflict check.");
    } finally {
      setSaving(false);
    }
  }

  const latest = items[0];

  const candidateAccessors = useMemo(
    () => ({
      type: (r: Candidate) => r.kind,
      match: (r: Candidate) => r.label,
      detail: (r: Candidate) => r.detail ?? "",
    }),
    [],
  );
  const {
    sortedRows: sortedCandidates,
    sortKey: candKey,
    sortDir: candDir,
    toggleSort: toggleCand,
  } = useTableSort(candidates, candidateAccessors, { key: "type", dir: "asc" });

  const historyAccessors = useMemo(
    () => ({
      date: (r: ConflictItem) => r.checkedAt,
      result: (r: ConflictItem) => r.result,
      query: (r: ConflictItem) => r.query,
      by: (r: ConflictItem) => r.checkedByName ?? "",
      notes: (r: ConflictItem) => r.notes ?? "",
    }),
    [],
  );
  const {
    sortedRows: sortedHistory,
    sortKey: histKey,
    sortDir: histDir,
    toggleSort: toggleHist,
  } = useTableSort(items, historyAccessors, { key: "date", dir: "desc" });

  return (
    <div
      className={highlight ? "panel" : undefined}
      style={
        highlight
          ? { marginTop: "1rem", borderColor: "var(--accent, #2a5)" }
          : undefined
      }
    >
      <div className="panel-head inline-head" style={{ marginBottom: "0.5rem" }}>
        <div>
          <h4 style={{ margin: 0 }}>Conflict check</h4>
          <p className="muted" style={{ margin: "0.25rem 0 0", fontSize: "0.85rem" }}>
            Search existing clients, matters, and related/opposing parties, then record Clear,
            Potential, or Blocked. Opening a matter may require Clear (firm setting).
          </p>
        </div>
        {latest ? (
          <Badge tone={resultTone(latest.result)}>{resultLabel(latest.result)}</Badge>
        ) : (
          <Badge tone="default">Not done</Badge>
        )}
      </div>

      {error ? (
        <p role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem" }}>
          {error}
        </p>
      ) : null}

      <Can permission="clients.edit">
        <form onSubmit={onSearch} className="toolbar" style={{ flexWrap: "wrap", marginBottom: "0.75rem" }}>
          <input
            className="search-input"
            placeholder="Search name, ID, matter…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ minWidth: "200px", flex: 1 }}
          />
          <Button type="submit" size="sm" variant="outline" disabled={searching}>
            {searching ? "Searching…" : "Search"}
          </Button>
        </form>

        {candidates.length > 0 ? (
          <div className="table-wrap" style={{ marginBottom: "0.75rem" }}>
            <table className="data data-dense">
              <thead>
                <tr>
                  <SortableTh label="Type" columnKey="type" activeKey={candKey} direction={candDir} onSort={toggleCand} />
                  <SortableTh label="Match" columnKey="match" activeKey={candKey} direction={candDir} onSort={toggleCand} />
                  <SortableTh label="Detail" columnKey="detail" activeKey={candKey} direction={candDir} onSort={toggleCand} />
                </tr>
              </thead>
              <tbody>
                {sortedCandidates.map((c) => (
                  <tr key={`${c.kind}-${c.id}`}>
                    <td>{c.kind.replace(/_/g, " ")}</td>
                    <td>{c.label}</td>
                    <td className="muted">{c.detail ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <form onSubmit={onRecord} className="toolbar" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
          <select
            className="filter-select"
            value={result}
            onChange={(e) => setResult(e.target.value as "clear" | "potential" | "blocked")}
            aria-label="Conflict result"
          >
            <option value="clear">Clear</option>
            <option value="potential">Potential conflict</option>
            <option value="blocked">Blocked</option>
          </select>
          <input
            className="search-input"
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{ minWidth: "180px", flex: 1 }}
          />
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? "Saving…" : "Record check"}
          </Button>
        </form>
      </Can>

      {loading ? (
        <p className="muted" style={{ fontSize: "0.85rem" }}>
          Loading history…
        </p>
      ) : items.length === 0 ? (
        <p className="muted" style={{ fontSize: "0.85rem", marginTop: "0.75rem" }}>
          No conflict checks recorded yet.
        </p>
      ) : (
        <div className="table-wrap" style={{ marginTop: "0.75rem" }}>
          <table className="data data-dense">
            <thead>
              <tr>
                <SortableTh label="Date" columnKey="date" activeKey={histKey} direction={histDir} onSort={toggleHist} />
                <SortableTh label="Result" columnKey="result" activeKey={histKey} direction={histDir} onSort={toggleHist} />
                <SortableTh label="Query" columnKey="query" activeKey={histKey} direction={histDir} onSort={toggleHist} />
                <SortableTh label="By" columnKey="by" activeKey={histKey} direction={histDir} onSort={toggleHist} />
                <SortableTh label="Notes" columnKey="notes" activeKey={histKey} direction={histDir} onSort={toggleHist} />
              </tr>
            </thead>
            <tbody>
              {sortedHistory.map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.checkedAt
                      ? new Date(item.checkedAt).toLocaleString(undefined, {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : "—"}
                  </td>
                  <td>
                    <Badge tone={resultTone(item.result)}>{resultLabel(item.result)}</Badge>
                  </td>
                  <td>{item.query}</td>
                  <td>{item.checkedByName ?? "—"}</td>
                  <td className="muted">{item.notes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
