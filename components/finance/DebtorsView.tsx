"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ExportMenu } from "@/components/export/ExportMenu";
import { FeeMoneyCallout } from "@/components/billing/FeeMoneyCallout";
import { DebtorCommunicationsPanel } from "@/components/finance/DebtorCommunicationsPanel";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SortableTh } from "@/components/ui/SortableTh";
import {
  AR_AGING_BUCKETS,
  agingBucketDisplay,
  type ArAgingBucket,
} from "@/lib/billing/aging";
import { centsToDisplay } from "@/lib/billing/money";
import { invoiceDetailPath } from "@/lib/billing/paths";
import type { DebtorsReport, DebtorsRow } from "@/lib/repos/debtors";
import { useTableSort } from "@/lib/ui/table-sort";

type MatterOption = { id: string; title: string; matterNumber: string | null };

function formatShortDate(value: string | null) {
  if (!value) return "n/a";
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function statusTone(bucket: ArAgingBucket) {
  if (bucket === "90+") return "danger" as const;
  if (bucket === "61-90" || bucket === "31-60") return "pending" as const;
  if (bucket === "1-30") return "default" as const;
  return "open" as const;
}

type BucketSummaryRow = {
  bucket: ArAgingBucket;
  count: number;
  balanceCents: number;
};

function DebtorsBucketSummaryTable({
  buckets,
  currency,
}: {
  buckets: BucketSummaryRow[];
  currency: string;
}) {
  const visible = useMemo(
    () => buckets.filter((b) => b.count > 0 || b.balanceCents > 0),
    [buckets],
  );
  const sortAccessors = useMemo(
    () => ({
      bucket: (r: BucketSummaryRow) => agingBucketDisplay(r.bucket),
      count: (r: BucketSummaryRow) => r.count,
      balance: (r: BucketSummaryRow) => r.balanceCents,
    }),
    [],
  );
  const { sortedRows, sortKey, sortDir, toggleSort } = useTableSort(visible, sortAccessors, {
    key: "bucket",
    dir: "asc",
  });

  return (
    <table className="data data-dense debtors-bucket-table">
      <thead>
        <tr>
          <SortableTh
            label="Bucket"
            columnKey="bucket"
            activeKey={sortKey}
            direction={sortDir}
            onSort={toggleSort}
          />
          <SortableTh
            label="Count"
            columnKey="count"
            activeKey={sortKey}
            direction={sortDir}
            onSort={toggleSort}
          />
          <SortableTh
            label="Balance"
            columnKey="balance"
            activeKey={sortKey}
            direction={sortDir}
            onSort={toggleSort}
          />
        </tr>
      </thead>
      <tbody>
        {sortedRows.map((b) => (
          <tr key={b.bucket}>
            <td>{agingBucketDisplay(b.bucket)}</td>
            <td>{b.count}</td>
            <td>{centsToDisplay(b.balanceCents, currency)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function DebtorsView() {
  const searchParams = useSearchParams();
  const urlClientId = searchParams.get("clientId")?.trim() || "";

  const [report, setReport] = useState<DebtorsReport | null>(null);
  const [matters, setMatters] = useState<MatterOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bucket, setBucket] = useState<ArAgingBucket | "">("");
  const [matterId, setMatterId] = useState("");
  const [clientIdFilter, setClientIdFilter] = useState(urlClientId);
  const [expandedClientId, setExpandedClientId] = useState<string | null>(
    urlClientId || null,
  );

  useEffect(() => {
    setClientIdFilter(urlClientId);
    if (urlClientId) setExpandedClientId(urlClientId);
  }, [urlClientId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (bucket) params.set("bucket", bucket);
      if (matterId) params.set("matterId", matterId);
      if (clientIdFilter) params.set("clientId", clientIdFilter);
      const res = await fetch(`/api/finance/debtors?${params.toString()}`, {
        credentials: "include",
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { report: DebtorsReport };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Could not load debtors.");
        setReport(null);
        return;
      }
      setReport(body.data.report);
    } catch {
      setError("Could not load debtors.");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [bucket, matterId, clientIdFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/matters?bucket=all", { credentials: "include" });
        const body = (await res.json()) as {
          ok?: boolean;
          data?: { items?: MatterOption[] };
        };
        if (!cancelled && res.ok && body.data?.items) {
          setMatters(body.data.items);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = report?.rows ?? [];

  const clientOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) {
      if (row.clientId) map.set(row.clientId, row.clientName);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [rows]);

  const bucketCounts = useMemo(() => {
    const counts: Partial<Record<ArAgingBucket, number>> = {};
    for (const row of rows) {
      counts[row.bucket] = (counts[row.bucket] ?? 0) + 1;
    }
    return counts;
  }, [rows]);

  const exportQuery = useMemo(
    () => ({
      bucket: bucket || undefined,
      matterId: matterId || undefined,
      clientId: clientIdFilter || undefined,
    }),
    [bucket, matterId, clientIdFilter],
  );

  const sortAccessors = useMemo(
    () => ({
      invoice: (r: DebtorsRow) => r.invoiceNumber,
      client: (r: DebtorsRow) => r.clientName,
      matter: (r: DebtorsRow) => r.matterNumber ?? r.matterTitle,
      due: (r: DebtorsRow) => r.dueDate,
      bucket: (r: DebtorsRow) => agingBucketDisplay(r.bucket),
      balance: (r: DebtorsRow) => r.balanceCents,
    }),
    [],
  );
  const { sortedRows, sortKey, sortDir, toggleSort } = useTableSort(rows, sortAccessors, {
    key: "due",
    dir: "asc",
  });

  const expandedName =
    rows.find((r) => r.clientId === expandedClientId)?.clientName ??
    clientOptions.find((c) => c.id === expandedClientId)?.name;

  return (
    <section className="view active scrollable finance-desk-view" aria-label="Debtors">
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Debtors</h3>
            <p className="panel-subtitle muted">
              Outstanding fee invoices · weekly collections view · contact timeline
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
            <ExportMenu kind="debtors" queryParams={exportQuery} disabled={loading} />
            <Button size="sm" variant="outline" onClick={() => load()} disabled={loading}>
              Refresh
            </Button>
          </div>
        </div>
        <div className="panel-body">
          <FeeMoneyCallout variant="list" />

          <p className="muted finance-aging-note">
            Ageing buckets use <strong>due date</strong> (current, 1–30, 31–60, 61–90, 90+ days
            past due). Fee AR only; trust balances are excluded. Expand a client row to log
            collection contacts.
          </p>

          {report?.summaryByCurrency.length ? (
            <div className="debtors-summary-grid">
              {report.summaryByCurrency.map((summary) => (
                <div key={summary.currency} className="debtors-currency-card panel">
                  <div className="debtors-currency-head">
                    <strong>{summary.currency}</strong>
                    <span>
                      {summary.invoiceCount} invoice{summary.invoiceCount === 1 ? "" : "s"} ·{" "}
                      {centsToDisplay(summary.totalBalanceCents, summary.currency)} outstanding
                    </span>
                  </div>
                  <DebtorsBucketSummaryTable
                    buckets={summary.buckets}
                    currency={summary.currency}
                  />
                </div>
              ))}
            </div>
          ) : null}

          <div className="toolbar">
            <select
              className="filter-select"
              value={bucket}
              onChange={(e) => setBucket(e.target.value as ArAgingBucket | "")}
              aria-label="Filter by ageing bucket"
            >
              <option value="">All buckets</option>
              {AR_AGING_BUCKETS.map((b) => (
                <option key={b} value={b}>
                  {agingBucketDisplay(b)}
                </option>
              ))}
            </select>
            <select
              className="filter-select"
              value={matterId}
              onChange={(e) => setMatterId(e.target.value)}
              aria-label="Filter by matter"
              style={{ minWidth: "200px" }}
            >
              <option value="">All matters</option>
              {matters.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.matterNumber ? `${m.matterNumber} · ${m.title}` : m.title}
                </option>
              ))}
            </select>
            {(clientOptions.length > 0 || clientIdFilter) && (
              <select
                className="filter-select"
                value={clientIdFilter}
                onChange={(e) => {
                  const next = e.target.value;
                  setClientIdFilter(next);
                  setExpandedClientId(next || null);
                }}
                aria-label="Filter by client"
                style={{ minWidth: "200px" }}
              >
                <option value="">All clients</option>
                {clientIdFilter &&
                !clientOptions.some((c) => c.id === clientIdFilter) ? (
                  <option value={clientIdFilter}>Selected client</option>
                ) : null}
                {clientOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {!loading && rows.length > 0 ? (
            <div className="finance-status-summary" aria-label="Bucket counts">
              {AR_AGING_BUCKETS.map((b) =>
                bucketCounts[b] ? (
                  <button
                    key={b}
                    type="button"
                    className={["finance-status-chip", bucket === b ? "active" : ""]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => setBucket(bucket === b ? "" : b)}
                  >
                    <span>{agingBucketDisplay(b)}</span>
                    <strong>{bucketCounts[b]}</strong>
                  </button>
                ) : null,
              )}
            </div>
          ) : null}

          {error ? (
            <p role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem" }}>
              {error}
            </p>
          ) : null}

          {loading && !report ? (
            <p className="muted" style={{ fontSize: "0.85rem" }}>
              Loading debtors…
            </p>
          ) : null}

          {!loading && rows.length === 0 ? (
            <EmptyState
              title="No outstanding fee balances"
              detail="Sent or overdue invoices with a balance appear here."
            />
          ) : (
            <div className="table-wrap">
              <table className="data data-dense finance-invoice-table">
                <thead>
                  <tr>
                    <th />
                    <SortableTh
                      label="Invoice"
                      columnKey="invoice"
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
                      label="Due"
                      columnKey="due"
                      activeKey={sortKey}
                      direction={sortDir}
                      onSort={toggleSort}
                    />
                    <SortableTh
                      label="Bucket"
                      columnKey="bucket"
                      activeKey={sortKey}
                      direction={sortDir}
                      onSort={toggleSort}
                    />
                    <SortableTh
                      label="Balance"
                      columnKey="balance"
                      activeKey={sortKey}
                      direction={sortDir}
                      onSort={toggleSort}
                    />
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row: DebtorsRow, index: number) => {
                    const isExpanded =
                      Boolean(row.clientId) && expandedClientId === row.clientId;
                    const showPanel =
                      isExpanded &&
                      sortedRows.findIndex((r) => r.clientId === row.clientId) === index;
                    return (
                      <Fragment key={row.invoiceId}>
                        <tr className={row.bucket !== "current" ? "row-overdue" : ""}>
                          <td>
                            {row.clientId ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setExpandedClientId(isExpanded ? null : row.clientId)
                                }
                                aria-expanded={isExpanded}
                                aria-label={
                                  isExpanded
                                    ? "Hide collection timeline"
                                    : "Show collection timeline"
                                }
                              >
                                {isExpanded ? "−" : "+"}
                              </Button>
                            ) : null}
                          </td>
                          <td>
                            <Link
                              href={invoiceDetailPath(row.invoiceId)}
                              className="finance-invoice-link"
                            >
                              {row.invoiceNumber}
                            </Link>
                            <div className="muted finance-cell-sub">{row.status}</div>
                          </td>
                          <td>
                            {row.clientId ? (
                              <Link href={`/clients/${row.clientId}`}>{row.clientName}</Link>
                            ) : (
                              row.clientName
                            )}
                          </td>
                          <td>
                            <Link href={`/matters/${row.matterId}`}>
                              {row.matterNumber ?? row.matterTitle}
                            </Link>
                            {row.matterNumber && row.matterTitle ? (
                              <div className="muted finance-cell-sub">{row.matterTitle}</div>
                            ) : null}
                          </td>
                          <td>{formatShortDate(row.dueDate)}</td>
                          <td>
                            <Badge tone={statusTone(row.bucket)}>
                              {agingBucketDisplay(row.bucket)}
                            </Badge>
                            {row.daysPastDue > 0 ? (
                              <div className="finance-ageing-hint">{row.daysPastDue}d</div>
                            ) : null}
                          </td>
                          <td className="finance-balance-outstanding">
                            {centsToDisplay(row.balanceCents, row.currency)}
                          </td>
                        </tr>
                        {showPanel ? (
                          <tr>
                            <td colSpan={7}>
                              <DebtorCommunicationsPanel
                                clientId={row.clientId!}
                                clientName={row.clientName}
                              />
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {expandedClientId && !rows.some((r) => r.clientId === expandedClientId) ? (
            <DebtorCommunicationsPanel
              clientId={expandedClientId}
              clientName={expandedName}
            />
          ) : null}

          {report ? (
            <p className="muted" style={{ fontSize: "0.75rem", marginTop: "1rem" }}>
              As of {new Date(report.asOf).toLocaleString()} · {report.rows.length} row
              {report.rows.length === 1 ? "" : "s"} in view
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
