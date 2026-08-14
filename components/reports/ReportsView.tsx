"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ReportType } from "@/lib/reports/types";
import { centsToDisplay, formatMinutes } from "@/lib/billing/money";
import { Button } from "@/components/ui/Button";
import { ExportMenu } from "@/components/export/ExportMenu";

const REPORTS: Array<{ id: ReportType; label: string }> = [
  { id: "ar-aging", label: "AR aging" },
  { id: "time", label: "Time" },
  { id: "trust-balances", label: "Trust balances" },
  { id: "trust-movements", label: "Trust movements" },
  { id: "workload", label: "Workload" },
  { id: "upcoming", label: "Upcoming" },
];

type Lawyer = { id: string; fullName: string };
type MatterOpt = { id: string; title: string; matterNumber: string | null };

function defaultFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 90);
  return d.toISOString().slice(0, 10);
}

function defaultTo(): string {
  return new Date().toISOString().slice(0, 10);
}

function upcomingTo(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

export function ReportsView() {
  const [type, setType] = useState<ReportType>("ar-aging");
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [lawyerId, setLawyerId] = useState("");
  const [matterId, setMatterId] = useState("");
  const [groupBy, setGroupBy] = useState<"lawyer" | "matter">("lawyer");
  const [lawyers, setLawyers] = useState<Lawyer[]>([]);
  const [matters, setMatters] = useState<MatterOpt[]>([]);
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [mRes, lRes] = await Promise.all([
          fetch("/api/matters?bucket=all", { credentials: "include" }),
          fetch("/api/matters?bucket=all&includeLawyers=1", { credentials: "include" }),
        ]);
        const mBody = (await mRes.json()) as {
          data?: { items?: MatterOpt[]; lawyers?: Lawyer[] };
        };
        const lBody = (await lRes.json()) as {
          data?: { items?: MatterOpt[]; lawyers?: Lawyer[] };
        };
        if (cancelled) return;
        if (mBody.data?.items) {
          setMatters(
            mBody.data.items.map((m) => ({
              id: m.id,
              title: m.title,
              matterNumber: m.matterNumber ?? null,
            })),
          );
        }
        const lawyersList = lBody.data?.lawyers ?? [];
        setLawyers(lawyersList);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (type === "upcoming") {
      setFrom(new Date().toISOString().slice(0, 10));
      setTo(upcomingTo());
    }
  }, [type]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", `${to}T23:59:59.999Z`);
    if (lawyerId) params.set("lawyerId", lawyerId);
    if (matterId) params.set("matterId", matterId);
    if (type === "time") params.set("groupBy", groupBy);
    return params.toString();
  }, [from, to, lawyerId, matterId, type, groupBy]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/${type}?${queryString}`, {
        credentials: "include",
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { report: Record<string, unknown> };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Could not load report.");
        setReport(null);
        return;
      }
      setReport(body.data.report);
    } catch {
      setError("Could not load report.");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [type, queryString]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="view active scrollable" aria-label="Reports">
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Reports</h3>
            <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>
              Firm-scoped. Fee AR and Trust stay separate. Requires reports.view.{" "}
              <Link href="/reports/lawyer-performance">Lawyer performance</Link>
            </p>
          </div>
          <ExportMenu
            kind="practice_report"
            queryParams={{
              type,
              from: type !== "trust-balances" && type !== "workload" ? from : undefined,
              to:
                type !== "trust-balances" && type !== "workload"
                  ? `${to}T23:59:59.999Z`
                  : undefined,
              lawyerId: lawyerId || undefined,
              matterId: matterId || undefined,
              groupBy: type === "time" ? groupBy : undefined,
            }}
            disabled={loading}
            label="Download"
          />
        </div>
        <div className="panel-body">
          <div className="toolbar" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
            <select
              className="filter-select"
              value={type}
              onChange={(e) => setType(e.target.value as ReportType)}
              aria-label="Report type"
            >
              {REPORTS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
            {type !== "trust-balances" && type !== "workload" ? (
              <>
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
              </>
            ) : null}
            {(type === "time" || type === "workload") && (
              <select
                className="filter-select"
                value={lawyerId}
                onChange={(e) => setLawyerId(e.target.value)}
                aria-label="Lawyer"
              >
                <option value="">All lawyers</option>
                {lawyers.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.fullName}
                  </option>
                ))}
              </select>
            )}
            {type === "time" ? (
              <select
                className="filter-select"
                value={groupBy}
                onChange={(e) =>
                  setGroupBy(e.target.value === "matter" ? "matter" : "lawyer")
                }
                aria-label="Group by"
              >
                <option value="lawyer">Group by lawyer</option>
                <option value="matter">Group by matter</option>
              </select>
            ) : null}
            {(type === "ar-aging" ||
              type === "time" ||
              type === "trust-movements" ||
              type === "upcoming") && (
              <select
                className="filter-select"
                value={matterId}
                onChange={(e) => setMatterId(e.target.value)}
                aria-label="Matter"
              >
                <option value="">All matters</option>
                {matters.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.matterNumber ? `${m.matterNumber} · ` : ""}
                    {m.title}
                  </option>
                ))}
              </select>
            )}
            <Button size="sm" disabled={loading} onClick={() => void load()}>
              {loading ? "Loading…" : "Refresh"}
            </Button>
          </div>

          {error ? (
            <p role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem" }}>
              {error}
            </p>
          ) : null}

          {report ? <ReportBody type={type} report={report} /> : null}
        </div>
      </div>
    </section>
  );
}

function ReportBody({
  type,
  report,
}: {
  type: ReportType;
  report: Record<string, unknown>;
}) {
  const note = typeof report.note === "string" ? report.note : null;
  const title = typeof report.title === "string" ? report.title : type;

  return (
    <div style={{ marginTop: "1rem" }}>
      <h4 style={{ marginBottom: "0.35rem" }}>{title}</h4>
      {note ? (
        <p className="muted" style={{ fontSize: "0.8rem", marginTop: 0 }}>
          {note}
        </p>
      ) : null}

      {type === "ar-aging" ? <ArAgingTable report={report} /> : null}
      {type === "time" ? <TimeTable report={report} /> : null}
      {type === "trust-balances" ? <TrustBalancesTable report={report} /> : null}
      {type === "trust-movements" ? <TrustMovementsTable report={report} /> : null}
      {type === "workload" ? <WorkloadTable report={report} /> : null}
      {type === "upcoming" ? <UpcomingTable report={report} /> : null}
    </div>
  );
}

function ArAgingTable({ report }: { report: Record<string, unknown> }) {
  const summary = (report.summary as Array<{
    bucket: string;
    count: number;
    balanceCents: number;
  }>) ?? [];
  const rows = (report.rows as Array<{
    invoiceNumber: string;
    status: string;
    clientName: string;
    matterTitle: string;
    dueDate: string | null;
    bucket: string;
    daysPastDue: number;
    currency: string;
    balanceCents: number;
  }>) ?? [];

  return (
    <>
      <table className="data" style={{ marginBottom: "1rem" }}>
        <thead>
          <tr>
            <th>Bucket</th>
            <th>Count</th>
            <th>Balance</th>
          </tr>
        </thead>
        <tbody>
          {summary.map((s) => (
            <tr key={s.bucket}>
              <td>{s.bucket}</td>
              <td>{s.count}</td>
              <td>{centsToDisplay(s.balanceCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table className="data">
        <thead>
          <tr>
            <th>Invoice</th>
            <th>Client</th>
            <th>Matter</th>
            <th>Due</th>
            <th>Bucket</th>
            <th>Balance</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((r) => (
              <tr key={`${r.invoiceNumber}-${r.dueDate}`}>
                <td>
                  {r.invoiceNumber} ({r.status})
                </td>
                <td>{r.clientName}</td>
                <td>{r.matterTitle}</td>
                <td>{r.dueDate ?? "n/a"}</td>
                <td>
                  {r.bucket}
                  {r.daysPastDue ? ` · ${r.daysPastDue}d` : ""}
                </td>
                <td>{centsToDisplay(r.balanceCents, r.currency)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={6} className="muted">
                No outstanding fee balances.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}

function TimeTable({ report }: { report: Record<string, unknown> }) {
  const rows = (report.rows as Array<{
    key: string;
    label: string;
    minutes: number;
    billableMinutes: number;
    amountCents: number;
    entries: number;
  }>) ?? [];

  return (
    <table className="data">
      <thead>
        <tr>
          <th>Group</th>
          <th>Minutes</th>
          <th>Billable</th>
          <th>Amount</th>
          <th>Entries</th>
        </tr>
      </thead>
      <tbody>
        {rows.length ? (
          rows.map((r) => (
            <tr key={r.key}>
              <td>{r.label}</td>
              <td>{formatMinutes(r.minutes)}</td>
              <td>{formatMinutes(r.billableMinutes)}</td>
              <td>{centsToDisplay(r.amountCents)}</td>
              <td>{r.entries}</td>
            </tr>
          ))
        ) : (
          <tr>
            <td colSpan={5} className="muted">
              No time entries in range.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function TrustBalancesTable({ report }: { report: Record<string, unknown> }) {
  const accounts = (report.accounts as Array<{
    id: string;
    name: string;
    currency: string;
    balanceCents: number;
    isActive: boolean;
  }>) ?? [];
  const clients = (report.clients as Array<{
    clientId: string;
    clientName: string;
    currency: string;
    balanceCents: number;
  }>) ?? [];

  return (
    <>
      <h5>Accounts</h5>
      <table className="data" style={{ marginBottom: "1rem" }}>
        <thead>
          <tr>
            <th>Account</th>
            <th>Active</th>
            <th>Balance</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((a) => (
            <tr key={a.id}>
              <td>{a.name}</td>
              <td>{a.isActive ? "yes" : "no"}</td>
              <td>{centsToDisplay(a.balanceCents, a.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h5>By client</h5>
      <table className="data">
        <thead>
          <tr>
            <th>Client</th>
            <th>Balance</th>
          </tr>
        </thead>
        <tbody>
          {clients.length ? (
            clients.map((c) => (
              <tr key={c.clientId}>
                <td>{c.clientName}</td>
                <td>{centsToDisplay(c.balanceCents, c.currency)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={2} className="muted">
                No client trust balances.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}

function TrustMovementsTable({ report }: { report: Record<string, unknown> }) {
  const rows = (report.rows as Array<{
    id: string;
    occurredAt: string;
    entryType: string;
    accountName: string;
    clientName: string | null;
    matterTitle: string | null;
    amountCents: number;
    currency: string;
    reference: string | null;
  }>) ?? [];

  return (
    <table className="data">
      <thead>
        <tr>
          <th>When</th>
          <th>Type</th>
          <th>Account</th>
          <th>Client</th>
          <th>Matter</th>
          <th>Amount</th>
          <th>Ref</th>
        </tr>
      </thead>
      <tbody>
        {rows.length ? (
          rows.map((r) => (
            <tr key={r.id}>
              <td>{new Date(r.occurredAt).toLocaleString()}</td>
              <td>{r.entryType}</td>
              <td>{r.accountName}</td>
              <td>{r.clientName ?? "n/a"}</td>
              <td>{r.matterTitle ?? "n/a"}</td>
              <td>{centsToDisplay(r.amountCents, r.currency)}</td>
              <td>{r.reference ?? ""}</td>
            </tr>
          ))
        ) : (
          <tr>
            <td colSpan={7} className="muted">
              No trust movements in range.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function WorkloadTable({ report }: { report: Record<string, unknown> }) {
  const summary = (report.summary as Array<{
    lawyerId: string | null;
    lawyerName: string;
    count: number;
    byStatus: Record<string, number>;
  }>) ?? [];
  const rows = (report.rows as Array<{
    matterId: string;
    title: string;
    matterNumber: string | null;
    status: string;
    lawyerName: string;
    clientName: string;
  }>) ?? [];

  return (
    <>
      <table className="data" style={{ marginBottom: "1rem" }}>
        <thead>
          <tr>
            <th>Lawyer</th>
            <th>Open matters</th>
            <th>By status</th>
          </tr>
        </thead>
        <tbody>
          {summary.map((s) => (
            <tr key={s.lawyerId ?? "unassigned"}>
              <td>{s.lawyerName}</td>
              <td>{s.count}</td>
              <td>
                {Object.entries(s.byStatus)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(", ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <table className="data">
        <thead>
          <tr>
            <th>Matter</th>
            <th>Client</th>
            <th>Lawyer</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.matterId}>
              <td>
                {r.matterNumber ? `${r.matterNumber} · ` : ""}
                {r.title}
              </td>
              <td>{r.clientName}</td>
              <td>{r.lawyerName}</td>
              <td>{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function UpcomingTable({ report }: { report: Record<string, unknown> }) {
  const hearings = (report.hearings as Array<{
    id: string;
    startsAt: string;
    eventType: string;
    title: string;
    matterTitle: string | null;
    matterNumber: string | null;
  }>) ?? [];
  const deadlines = (report.deadlines as Array<{
    id: string;
    dueAt: string;
    title: string;
    matterTitle: string | null;
    matterNumber: string | null;
  }>) ?? [];

  return (
    <>
      <h5>Calendar / hearings</h5>
      <table className="data" style={{ marginBottom: "1rem" }}>
        <thead>
          <tr>
            <th>When</th>
            <th>Type</th>
            <th>Title</th>
            <th>Matter</th>
          </tr>
        </thead>
        <tbody>
          {hearings.length ? (
            hearings.map((h) => (
              <tr key={h.id}>
                <td>{new Date(h.startsAt).toLocaleString()}</td>
                <td>{h.eventType}</td>
                <td>{h.title}</td>
                <td>
                  {h.matterNumber ? `${h.matterNumber} · ` : ""}
                  {h.matterTitle ?? "n/a"}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={4} className="muted">
                No calendar events in range.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <h5>Deadlines</h5>
      <table className="data">
        <thead>
          <tr>
            <th>Due</th>
            <th>Title</th>
            <th>Matter</th>
          </tr>
        </thead>
        <tbody>
          {deadlines.length ? (
            deadlines.map((d) => (
              <tr key={d.id}>
                <td>{new Date(d.dueAt).toLocaleString()}</td>
                <td>{d.title}</td>
                <td>
                  {d.matterNumber ? `${d.matterNumber} · ` : ""}
                  {d.matterTitle ?? "n/a"}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={3} className="muted">
                No open deadlines in range.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}
