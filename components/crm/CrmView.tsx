"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { Can } from "@/components/auth/Can";
import { ExportMenu } from "@/components/export/ExportMenu";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

type BirthdayRow = {
  clientId: string;
  clientNumber: string;
  displayName: string;
  displayLabel: string;
  dateOfBirth: string;
  dayOfMonth: number;
  ageTurning: number | null;
  responsibleLawyers: string[];
};

type HolidayRow = {
  id: string;
  holidayDate: string;
  name: string;
  country: string;
};

type LawyerOption = { id: string; label: string };

type Overview = {
  thisMonth: { month: number; monthLabel: string; count: number; rows: BirthdayRow[] };
  nextMonth: { month: number; monthLabel: string; count: number; rows: BirthdayRow[] };
  holidaysThisMonth: HolidayRow[];
};

export function CrmView() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [lawyers, setLawyers] = useState<LawyerOption[]>([]);
  const [lawyerFilter, setLawyerFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTable, setActiveTable] = useState<"this" | "next">("this");

  const [holidayOpen, setHolidayOpen] = useState(false);
  const [holidayDate, setHolidayDate] = useState(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });
  const [holidayName, setHolidayName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (lawyerFilter) params.set("responsibleLawyerId", lawyerFilter);
      const res = await fetch(`/api/crm/overview?${params}`, { credentials: "include" });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { overview: Overview; lawyers: LawyerOption[] };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        throw new Error(body.error?.message ?? "Could not load CRM.");
      }
      setOverview(body.data.overview);
      setLawyers(body.data.lawyers);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load CRM.");
      setOverview(null);
    } finally {
      setLoading(false);
    }
  }, [lawyerFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportQuery = useMemo(
    () => ({
      month: String(
        activeTable === "this" ? overview?.thisMonth.month : overview?.nextMonth.month,
      ),
      responsibleLawyerId: lawyerFilter || undefined,
    }),
    [activeTable, overview, lawyerFilter],
  );

  async function submitHoliday(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/crm/holidays", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          holidayDate: new Date(`${holidayDate}T12:00:00`).toISOString(),
          name: holidayName,
        }),
      });
      const body = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not add holiday.");
        return;
      }
      setHolidayOpen(false);
      setHolidayName("");
      await load();
    } catch {
      setError("Could not add holiday.");
    } finally {
      setSaving(false);
    }
  }

  async function removeHoliday(id: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm/holidays/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const body = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not remove holiday.");
        return;
      }
      await load();
    } catch {
      setError("Could not remove holiday.");
    } finally {
      setSaving(false);
    }
  }

  const tableRows =
    activeTable === "this" ? overview?.thisMonth.rows ?? [] : overview?.nextMonth.rows ?? [];

  return (
    <section className="view active scrollable finance-desk-view crm-desk-view" aria-label="CRM">
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Client relationships</h3>
            <p className="panel-subtitle muted">
              Birthdays and holidays for thoughtful client care
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
            <ExportMenu
              kind="birthday_list"
              queryParams={exportQuery}
              formats={["pdf", "docx", "xlsx"]}
              disabled={loading || !overview}
              label="Export birthdays"
            />
            <Button size="sm" variant="outline" onClick={() => load()} disabled={loading}>
              Refresh
            </Button>
          </div>
        </div>
        <div className="panel-body">
          <div className="finance-desk-callout firm-desk-callout" role="note">
            <div className="finance-desk-callout-title">Practice CRM, not marketing</div>
            <p>
              Use this desk to remember client birthdays and plan around public holidays. Greeting
              emails are not sent automatically.
            </p>
          </div>

          {error ? (
            <p role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem" }}>
              {error}
            </p>
          ) : null}

          <div className="toolbar" style={{ marginBottom: "0.75rem" }}>
            <select
              className="filter-select"
              value={lawyerFilter}
              onChange={(e) => setLawyerFilter(e.target.value)}
              style={{ minWidth: "200px" }}
            >
              <option value="">All responsible lawyers</option>
              {lawyers.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>

          {overview ? (
            <>
              <div className="trust-overview-cards" style={{ marginBottom: "1rem" }}>
                <button
                  type="button"
                  className="trust-overview-card panel"
                  style={{
                    cursor: "pointer",
                    textAlign: "left",
                    border: activeTable === "this" ? "2px solid var(--accent)" : undefined,
                  }}
                  onClick={() => setActiveTable("this")}
                >
                  <div className="trust-overview-card-label">Birthdays this month</div>
                  <div className="trust-overview-card-balance">{overview.thisMonth.count}</div>
                  <div className="muted" style={{ fontSize: "0.75rem" }}>
                    {overview.thisMonth.monthLabel}
                  </div>
                </button>
                <button
                  type="button"
                  className="trust-overview-card panel"
                  style={{
                    cursor: "pointer",
                    textAlign: "left",
                    border: activeTable === "next" ? "2px solid var(--accent)" : undefined,
                  }}
                  onClick={() => setActiveTable("next")}
                >
                  <div className="trust-overview-card-label">Birthdays next month</div>
                  <div className="trust-overview-card-balance">{overview.nextMonth.count}</div>
                  <div className="muted" style={{ fontSize: "0.75rem" }}>
                    {overview.nextMonth.monthLabel}
                  </div>
                </button>
                <div className="trust-overview-card panel">
                  <div className="trust-overview-card-label">Public holidays this month</div>
                  <div className="trust-overview-card-balance">
                    {overview.holidaysThisMonth.length}
                  </div>
                  <div className="muted" style={{ fontSize: "0.75rem" }}>
                    Zimbabwe (seeded)
                  </div>
                </div>
              </div>

              <h4>
                {activeTable === "this"
                  ? overview.thisMonth.monthLabel
                  : overview.nextMonth.monthLabel}{" "}
                birthdays
              </h4>
              {!tableRows.length ? (
                <EmptyState
                  title="No birthdays on file"
                  detail="Add date of birth on individual client KYC profiles to see them here."
                />
              ) : (
                <div className="table-wrap" style={{ marginBottom: "1.5rem" }}>
                  <table className="data data-dense">
                    <thead>
                      <tr>
                        <th>Day</th>
                        <th>Client</th>
                        <th>Turning</th>
                        <th>Lawyer(s)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableRows.map((row) => (
                        <tr key={row.clientId}>
                          <td>{row.dayOfMonth}</td>
                          <td>
                            <Link href={`/clients/${row.clientId}`}>{row.displayLabel}</Link>
                          </td>
                          <td>{row.ageTurning != null ? row.ageTurning : "n/a"}</td>
                          <td className="muted" style={{ fontSize: "0.8rem" }}>
                            {row.responsibleLawyers.length
                              ? row.responsibleLawyers.join(", ")
                              : "Unassigned"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <h4 style={{ margin: 0 }}>Public holidays this month</h4>
                <Can permission="crm.manage">
                  <Button size="sm" variant="outline" onClick={() => setHolidayOpen(true)}>
                    Add holiday
                  </Button>
                </Can>
              </div>

              {holidayOpen ? (
                <form
                  onSubmit={submitHoliday}
                  className="panel"
                  style={{ padding: "1rem", margin: "0.75rem 0" }}
                >
                  <div className="grid-2">
                    <div className="form-group">
                      <label htmlFor="crm-h-date">Date</label>
                      <input
                        id="crm-h-date"
                        type="date"
                        value={holidayDate}
                        onChange={(e) => setHolidayDate(e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="crm-h-name">Name</label>
                      <input
                        id="crm-h-name"
                        value={holidayName}
                        onChange={(e) => setHolidayName(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <Button type="submit" size="sm" disabled={saving}>
                      Save
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setHolidayOpen(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : null}

              {!overview.holidaysThisMonth.length ? (
                <p className="muted" style={{ fontSize: "0.85rem" }}>
                  No holidays recorded for this month.
                </p>
              ) : (
                <div className="table-wrap">
                  <table className="data data-dense">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Holiday</th>
                        <th>Country</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {overview.holidaysThisMonth.map((h) => (
                        <tr key={h.id}>
                          <td>{new Date(h.holidayDate).toLocaleDateString()}</td>
                          <td>{h.name}</td>
                          <td>
                            <Badge tone="open">{h.country}</Badge>
                          </td>
                          <td>
                            <Can permission="crm.manage">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={saving}
                                onClick={() => void removeHoliday(h.id)}
                              >
                                Remove
                              </Button>
                            </Can>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
