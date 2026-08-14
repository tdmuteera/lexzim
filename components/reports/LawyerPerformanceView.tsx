"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatedBarChart } from "@/components/dashboard/DashboardCharts";
import { ExportMenu } from "@/components/export/ExportMenu";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { centsToDisplay } from "@/lib/billing/money";

type PerformanceRow = {
  lawyerId: string | null;
  lawyerName: string;
  openMatters: number;
  collectedCents: number;
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

export function LawyerPerformanceView() {
  const [from, setFrom] = useState(yearStart);
  const [to, setTo] = useState(today);
  const [report, setReport] = useState<Report | null>(null);
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
        return;
      }
      setReport(body.data.report);
    } catch {
      setError("Could not load lawyer performance.");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

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
                      <th>Lawyer</th>
                      <th>Open matters</th>
                      <th>Fees collected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((r) => (
                      <tr key={r.lawyerId ?? "unassigned"}>
                        <td>{r.lawyerName}</td>
                        <td>{r.openMatters}</td>
                        <td>{centsToDisplay(r.collectedCents, currency)}</td>
                      </tr>
                    ))}
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
