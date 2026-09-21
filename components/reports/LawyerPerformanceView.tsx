"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { AnimatedBarChart } from "@/components/dashboard/DashboardCharts";
import { ExportMenu } from "@/components/export/ExportMenu";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SortableTh } from "@/components/ui/SortableTh";
import { centsToDisplay } from "@/lib/billing/money";
import { useTableSort } from "@/lib/ui/table-sort";

type PerformanceRow = {
  lawyerId: string | null;
  lawyerName: string;
  openMatters: number;
  collectedCents: number;
};

type CommissionRow = {
  lawyerId: string | null;
  collectedCents: number;
  monthlyTargetCents: number;
  remainingToTargetCents: number;
  aboveTargetCents: number;
  commissionDueCents: number;
};

type GlCheck = {
  feePaymentsTotalCents: number;
  glRevenueCents: number;
  varianceCents: number;
  mismatch: boolean;
  note: string;
};

type Report = {
  title: string;
  from: string;
  to: string;
  currency: string;
  viewAll: boolean;
  attributionPolicy: string;
  rows: PerformanceRow[];
  totals: { openMatters: number; collectedCents: number };
  glCheck: GlCheck | null;
};

function yearStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-01-01`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** When from/to fall in the same calendar month, return YYYY-MM for commission overlay. */
function sameCalendarMonth(fromDate: string, toDate: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
    return null;
  }
  const fm = fromDate.slice(0, 7);
  const tm = toDate.slice(0, 7);
  return fm === tm ? fm : null;
}

export function LawyerPerformanceView() {
  const { can } = useAuth();
  const canViewCommission = can("finance.commission.view");
  const [from, setFrom] = useState(yearStart);
  const [to, setTo] = useState(today);
  const [report, setReport] = useState<Report | null>(null);
  const [commissionByLawyer, setCommissionByLawyer] = useState<Map<string, CommissionRow> | null>(
    null,
  );
  const [commissionMonth, setCommissionMonth] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("from", `${from}T00:00:00`);
      params.set("to", `${to}T23:59:59.999`);
      const res = await fetch(`/api/reports/lawyer-performance?${params.toString()}`, {
        credentials: "include",
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { report: Report };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Could not load lawyer performance.");
        setReport(null);
        setCommissionByLawyer(null);
        setCommissionMonth(null);
        return;
      }
      setReport(body.data.report);

      const monthKey = canViewCommission ? sameCalendarMonth(from, to) : null;
      setCommissionMonth(monthKey);
      if (monthKey) {
        const cRes = await fetch(`/api/finance/commission?month=${encodeURIComponent(monthKey)}`, {
          credentials: "include",
        });
        const cBody = (await cRes.json()) as {
          ok: boolean;
          data?: {
            report: {
              configured: boolean;
              rows: CommissionRow[];
            };
          };
        };
        if (cRes.ok && cBody.ok && cBody.data?.report.configured) {
          const map = new Map<string, CommissionRow>();
          for (const row of cBody.data.report.rows) {
            map.set(row.lawyerId ?? "unassigned", row);
          }
          setCommissionByLawyer(map);
        } else {
          setCommissionByLawyer(null);
        }
      } else {
        setCommissionByLawyer(null);
      }
    } catch {
      setError("Could not load lawyer performance.");
      setReport(null);
      setCommissionByLawyer(null);
    } finally {
      setLoading(false);
    }
  }, [canViewCommission, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const caseloadBars = useMemo(
    () =>
      (report?.rows ?? []).map((r) => ({
        key: r.lawyerId ?? "unassigned",
        label: r.lawyerName.split(" ")[0] || r.lawyerName,
        value: r.openMatters,
      })),
    [report],
  );

  const revenueBars = useMemo(
    () =>
      (report?.rows ?? []).map((r) => ({
        key: r.lawyerId ?? "unassigned",
        label: r.lawyerName.split(" ")[0] || r.lawyerName,
        value: r.collectedCents / 100,
      })),
    [report],
  );

  const currency = report?.currency ?? "USD";
  const exportQuery = {
    from: `${from}T00:00:00`,
    to: `${to}T23:59:59.999`,
  };

  const performanceRows = report?.rows ?? [];
  const sortAccessors = useMemo(
    () => ({
      lawyer: (r: PerformanceRow) => r.lawyerName,
      openMatters: (r: PerformanceRow) => r.openMatters,
      collected: (r: PerformanceRow) => r.collectedCents,
      remaining: (r: PerformanceRow) =>
        commissionByLawyer?.get(r.lawyerId ?? "unassigned")?.remainingToTargetCents ?? 0,
      above: (r: PerformanceRow) =>
        commissionByLawyer?.get(r.lawyerId ?? "unassigned")?.aboveTargetCents ?? 0,
      commission: (r: PerformanceRow) =>
        commissionByLawyer?.get(r.lawyerId ?? "unassigned")?.commissionDueCents ?? 0,
    }),
    [commissionByLawyer],
  );
  const { sortedRows, sortKey, sortDir, toggleSort } = useTableSort(
    performanceRows,
    sortAccessors,
    { key: "lawyer", dir: "asc" },
  );

  return (
    <section className="view active scrollable" aria-label="Lawyer performance">
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Lawyer performance</h3>
            <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>
              Open caseload and fees collected by responsible lawyer.
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            {canViewCommission ? (
              <Link href="/finance/commission" className="btn btn-ghost btn-sm">
                Commission
              </Link>
            ) : null}
            <Link href="/reports" className="btn btn-ghost btn-sm">
              All reports
            </Link>
            <ExportMenu kind="lawyer_performance" queryParams={exportQuery} disabled={loading} />
          </div>
        </div>
        <div className="panel-body">
          <div className="toolbar" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
            <input
              type="date"
              className="filter-select"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              aria-label="From date"
            />
            <input
              type="date"
              className="filter-select"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              aria-label="To date"
            />
            <Button size="sm" disabled={loading} onClick={() => void load()}>
              {loading ? "Loading…" : "Refresh"}
            </Button>
          </div>

          {error ? (
            <p role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem" }}>
              {error}
            </p>
          ) : null}

          {report ? (
            <>
              <p className="muted" style={{ fontSize: "0.8rem", maxWidth: "52rem" }}>
                {report.attributionPolicy}{" "}
                {report.viewAll ? "Showing the firm." : "Showing your matters only."}
                {canViewCommission && commissionMonth && commissionByLawyer ? (
                  <>
                    {" "}
                    Commission columns use the monthly target for {commissionMonth} (same formula as
                    Finance → Commission).
                  </>
                ) : canViewCommission && !commissionMonth ? (
                  <>
                    {" "}
                    Set From and To to the same calendar month to overlay commission due, or open{" "}
                    <Link href="/finance/commission">Finance → Commission</Link>.
                  </>
                ) : null}
              </p>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(16rem, 1fr))",
                  gap: "0.75rem",
                  marginBottom: "1rem",
                }}
              >
                <div className="panel">
                  <div className="panel-head">
                    <h3>Open matters</h3>
                    <span className="muted">{report.totals.openMatters} total</span>
                  </div>
                  <div className="panel-body">
                    {caseloadBars.every((b) => b.value === 0) ? (
                      <p className="muted">No open matters in this scope.</p>
                    ) : (
                      <AnimatedBarChart bars={caseloadBars} formatValue={(n) => String(n)} />
                    )}
                  </div>
                </div>
                <div className="panel">
                  <div className="panel-head">
                    <h3>Fees collected</h3>
                    <span className="muted">{centsToDisplay(report.totals.collectedCents, currency)}</span>
                  </div>
                  <div className="panel-body">
                    {revenueBars.every((b) => b.value === 0) ? (
                      <p className="muted">No fee receipts in this period.</p>
                    ) : (
                      <AnimatedBarChart
                        bars={revenueBars}
                        formatValue={(n) =>
                          n >= 1000 ? `${Math.round(n / 1000)}k` : centsToDisplay(Math.round(n * 100), currency)
                        }
                      />
                    )}
                  </div>
                </div>
              </div>

              {report.glCheck ? (
                <p
                  className={report.glCheck.mismatch ? "" : "muted"}
                  style={{
                    fontSize: "0.8rem",
                    padding: "0.65rem 0.75rem",
                    borderRadius: "6px",
                    background: report.glCheck.mismatch
                      ? "rgba(160, 124, 56, 0.12)"
                      : "rgba(58, 115, 86, 0.08)",
                    marginBottom: "1rem",
                  }}
                >
                  <strong>GL check: </strong>
                  cash collected {centsToDisplay(report.glCheck.feePaymentsTotalCents, currency)}
                  {" vs "}
                  GL revenue {centsToDisplay(report.glCheck.glRevenueCents, currency)}
                  {report.glCheck.mismatch
                    ? ` (variance ${centsToDisplay(report.glCheck.varianceCents, currency)}). `
                    : ". "}
                  {report.glCheck.note}
                </p>
              ) : null}

              {report.rows.length === 0 ? (
                <EmptyState
                  title="No lawyer rows"
                  detail="Assign a responsible lawyer on open matters, or record fee receipts in this period."
                />
              ) : (
                <table className="data">
                  <thead>
                    <tr>
                      <SortableTh
                        label="Lawyer"
                        columnKey="lawyer"
                        activeKey={sortKey}
                        direction={sortDir}
                        onSort={toggleSort}
                      />
                      <SortableTh
                        label="Open matters"
                        columnKey="openMatters"
                        activeKey={sortKey}
                        direction={sortDir}
                        onSort={toggleSort}
                      />
                      <SortableTh
                        label="Fees collected"
                        columnKey="collected"
                        activeKey={sortKey}
                        direction={sortDir}
                        onSort={toggleSort}
                      />
                      {commissionByLawyer ? (
                        <>
                          <SortableTh
                            label="Remaining to target"
                            columnKey="remaining"
                            activeKey={sortKey}
                            direction={sortDir}
                            onSort={toggleSort}
                          />
                          <SortableTh
                            label="Above target"
                            columnKey="above"
                            activeKey={sortKey}
                            direction={sortDir}
                            onSort={toggleSort}
                          />
                          <SortableTh
                            label="Commission due"
                            columnKey="commission"
                            activeKey={sortKey}
                            direction={sortDir}
                            onSort={toggleSort}
                          />
                        </>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.map((r) => {
                      const c = commissionByLawyer?.get(r.lawyerId ?? "unassigned");
                      return (
                        <tr key={r.lawyerId ?? "unassigned"}>
                          <td>{r.lawyerName}</td>
                          <td>{r.openMatters}</td>
                          <td>{centsToDisplay(r.collectedCents, currency)}</td>
                          {commissionByLawyer ? (
                            <>
                              <td>
                                {c
                                  ? centsToDisplay(c.remainingToTargetCents, currency)
                                  : centsToDisplay(0, currency)}
                              </td>
                              <td>
                                {c
                                  ? centsToDisplay(c.aboveTargetCents, currency)
                                  : centsToDisplay(0, currency)}
                              </td>
                              <td>
                                {c
                                  ? centsToDisplay(c.commissionDueCents, currency)
                                  : centsToDisplay(0, currency)}
                              </td>
                            </>
                          ) : null}
                        </tr>
                      );
                    })}
                    <tr>
                      <td>
                        <strong>Total</strong>
                      </td>
                      <td>
                        <strong>{report.totals.openMatters}</strong>
                      </td>
                      <td>
                        <strong>{centsToDisplay(report.totals.collectedCents, currency)}</strong>
                      </td>
                      {commissionByLawyer ? (
                        <>
                          <td colSpan={3} className="muted" style={{ fontSize: "0.8rem" }}>
                            Target and commission are per lawyer (see Finance → Commission).
                          </td>
                        </>
                      ) : null}
                    </tr>
                  </tbody>
                </table>
              )}
            </>
          ) : null}

          {loading && !report ? (
            <p className="muted" style={{ fontSize: "0.85rem" }}>
              Loading lawyer performance…
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
