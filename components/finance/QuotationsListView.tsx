"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Can } from "@/components/auth/Can";
import { FeeMoneyCallout } from "@/components/billing/FeeMoneyCallout";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SortableTh } from "@/components/ui/SortableTh";
import { centsToDisplay } from "@/lib/billing/money";
import { QUOTE_STATUSES, quoteStatusLabel } from "@/lib/quotes/totals";
import { useTableSort } from "@/lib/ui/table-sort";

type QuotationItem = {
  id: string;
  quoteNumber: string;
  status: string;
  statusLabel: string;
  currency: string;
  clientId: string;
  clientDisplayLabel: string;
  matterId: string | null;
  matterTitle: string | null;
  matterNumber: string | null;
  validUntil: string | null;
  totalCents: number;
  createdAt: string;
};

function statusTone(status: string) {
  if (status === "accepted") return "open" as const;
  if (status === "declined" || status === "expired") return "closed" as const;
  if (status === "sent") return "default" as const;
  return "pending" as const;
}

function formatShortDate(value: string | null) {
  if (!value) return "n/a";
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function QuotationsListView() {
  const [items, setItems] = useState<QuotationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [clientId, setClientId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const q of items) {
      counts[q.status] = (counts[q.status] ?? 0) + 1;
    }
    return counts;
  }, [items]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (clientId) params.set("clientId", clientId);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await fetch(`/api/finance/quotations?${params.toString()}`, {
        credentials: "include",
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { items: QuotationItem[] };
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not load quotations.");
        setItems([]);
        return;
      }
      setItems(body.data?.items ?? []);
    } catch {
      setError("Could not load quotations.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [status, clientId, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const sortAccessors = useMemo(
    () => ({
      quoteNumber: (r: QuotationItem) => r.quoteNumber,
      client: (r: QuotationItem) => r.clientDisplayLabel,
      matter: (r: QuotationItem) =>
        [r.matterNumber, r.matterTitle].filter(Boolean).join(" · ") || "",
      status: (r: QuotationItem) => r.statusLabel,
      validUntil: (r: QuotationItem) => r.validUntil,
      total: (r: QuotationItem) => r.totalCents,
      created: (r: QuotationItem) => r.createdAt,
    }),
    [],
  );
  const { sortedRows, sortKey, sortDir, toggleSort } = useTableSort(items, sortAccessors, {
    key: "created",
    dir: "desc",
  });

  return (
    <section className="view active scrollable finance-desk-view" aria-label="Quotations">
      <div className="panel">
        <div className="panel-head">
          <div>
            <h1>Quotations</h1>
            <p className="muted">
              Service catalogue quotes for clients. Quotes do not post to the ledger until converted
              to an invoice.
            </p>
          </div>
          <Can permission="finance.quote.manage">
            <Link href="/finance/quotations/new" className="btn btn-primary btn-sm">
              New quotation
            </Link>
          </Can>
        </div>

        <FeeMoneyCallout />

        <div className="filter-row">
          <label>
            <span className="muted">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              {QUOTE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {quoteStatusLabel(s)}
                  {statusCounts[s] != null ? ` (${statusCounts[s]})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="muted">Client ID</span>
            <input
              type="text"
              placeholder="Filter by client UUID…"
              value={clientId}
              onChange={(e) => setClientId(e.target.value.trim())}
            />
          </label>
          <label>
            <span className="muted">From</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            <span className="muted">To</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
        </div>

        {error ? (
          <p role="alert" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        ) : null}

        {loading && items.length === 0 ? (
          <p className="muted">Loading quotations…</p>
        ) : null}

        {!loading && items.length === 0 ? (
          <EmptyState
            title="No quotations yet"
            detail="Create a quote from the firm service catalogue for a client."
            action={
              <Can permission="finance.quote.manage">
                <Link href="/finance/quotations/new" className="btn btn-primary btn-sm">
                  New quotation
                </Link>
              </Can>
            }
          />
        ) : null}

        {items.length > 0 ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <SortableTh
                    label="Quote #"
                    columnKey="quoteNumber"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="Client"
                    columnKey="client"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="Matter"
                    columnKey="matter"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="Status"
                    columnKey="status"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="Valid until"
                    columnKey="validUntil"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="Total"
                    columnKey="total"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                    className="num"
                    align="right"
                  />
                  <SortableTh
                    label="Created"
                    columnKey="created"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((q) => (
                  <tr key={q.id}>
                    <td>
                      <Link href={`/finance/quotations/${q.id}`} className="table-link">
                        {q.quoteNumber}
                      </Link>
                    </td>
                    <td>{q.clientDisplayLabel}</td>
                    <td>
                      {q.matterNumber || q.matterTitle
                        ? [q.matterNumber, q.matterTitle].filter(Boolean).join(" · ")
                        : "—"}
                    </td>
                    <td>
                      <Badge tone={statusTone(q.status)}>{q.statusLabel}</Badge>
                    </td>
                    <td>{formatShortDate(q.validUntil)}</td>
                    <td className="num">{centsToDisplay(q.totalCents, q.currency)}</td>
                    <td>{formatShortDate(q.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  );
}
