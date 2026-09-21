"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { Can } from "@/components/auth/Can";
import { ClientEmailButton } from "@/components/email/ClientEmailButton";
import { ExportMenu } from "@/components/export/ExportMenu";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SortableTh } from "@/components/ui/SortableTh";
import { useTableSort } from "@/lib/ui/table-sort";

type BirthdayRow = {
  clientId: string;
  clientNumber: string;
  displayName: string;
  displayLabel: string;
  email?: string | null;
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
  const [holidayYear, setHolidayYear] = useState(() => new Date().getFullYear());
  const [yearHolidays, setYearHolidays] = useState<HolidayRow[]>([]);
  const [editingHolidayId, setEditingHolidayId] = useState<string | null>(null);
  const [editHolidayDate, setEditHolidayDate] = useState("");
  const [editHolidayName, setEditHolidayName] = useState("");

  const loadYearHolidays = useCallback(async (year: number) => {
    try {
      const res = await fetch(`/api/crm/holidays?year=${year}`, { credentials: "include" });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { items: HolidayRow[] };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        throw new Error(body.error?.message ?? "Could not load holidays.");
      }
      setYearHolidays(body.data.items);
    } catch (e) {
      setYearHolidays([]);
      setError(e instanceof Error ? e.message : "Could not load holidays.");
    }
  }, []);

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

  useEffect(() => {
    void loadYearHolidays(holidayYear);
  }, [holidayYear, loadYearHolidays]);

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
      await Promise.all([load(), loadYearHolidays(holidayYear)]);
    } catch {
      setError("Could not add holiday.");
    } finally {
      setSaving(false);
    }
  }

  function startEditHoliday(h: HolidayRow) {
    setEditingHolidayId(h.id);
    setEditHolidayName(h.name);
    const d = new Date(h.holidayDate);
    const pad = (n: number) => String(n).padStart(2, "0");
    setEditHolidayDate(
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    );
  }

  async function editHoliday(id: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm/holidays/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          holidayDate: new Date(`${editHolidayDate}T12:00:00`).toISOString(),
          name: editHolidayName.trim(),
        }),
      });
      const body = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not update holiday.");
        return;
      }
      setEditingHolidayId(null);
      await Promise.all([load(), loadYearHolidays(holidayYear)]);
    } catch {
      setError("Could not update holiday.");
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
      if (editingHolidayId === id) setEditingHolidayId(null);
      await Promise.all([load(), loadYearHolidays(holidayYear)]);
    } catch {
      setError("Could not remove holiday.");
    } finally {
      setSaving(false);
    }
  }

  const tableRows =
    activeTable === "this" ? overview?.thisMonth.rows ?? [] : overview?.nextMonth.rows ?? [];

  const birthdayAccessors = useMemo(
    () => ({
      day: (r: BirthdayRow) => r.dayOfMonth,
      client: (r: BirthdayRow) => r.displayLabel,
      turning: (r: BirthdayRow) => r.ageTurning ?? 0,
      lawyers: (r: BirthdayRow) => r.responsibleLawyers.join(", "),
    }),
    [],
  );
  const {
    sortedRows: sortedBirthdays,
    sortKey: bdayKey,
    sortDir: bdayDir,
    toggleSort: toggleBday,
  } = useTableSort(tableRows, birthdayAccessors, { key: "day", dir: "asc" });

  const monthHolidays = overview?.holidaysThisMonth ?? [];
  const holidayAccessors = useMemo(
    () => ({
      date: (r: HolidayRow) => r.holidayDate,
      holiday: (r: HolidayRow) => r.name,
      country: (r: HolidayRow) => r.country,
    }),
    [],
  );
  const {
    sortedRows: sortedMonthHolidays,
    sortKey: monthHolKey,
    sortDir: monthHolDir,
    toggleSort: toggleMonthHol,
  } = useTableSort(monthHolidays, holidayAccessors, { key: "date", dir: "asc" });

  const {
    sortedRows: sortedYearHolidays,
    sortKey: yearHolKey,
    sortDir: yearHolDir,
    toggleSort: toggleYearHol,
  } = useTableSort(yearHolidays, holidayAccessors, { key: "date", dir: "asc" });

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
              Birthdays stay visible here so you can greet clients thoughtfully. Holiday client
              emails are not automatic for now. Use <strong>Send greeting</strong> to craft a
              message and signature, then confirm Send.
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
                        <SortableTh
                          label="Day"
                          columnKey="day"
                          activeKey={bdayKey}
                          direction={bdayDir}
                          onSort={toggleBday}
                        />
                        <SortableTh
                          label="Client"
                          columnKey="client"
                          activeKey={bdayKey}
                          direction={bdayDir}
                          onSort={toggleBday}
                        />
                        <SortableTh
                          label="Turning"
                          columnKey="turning"
                          activeKey={bdayKey}
                          direction={bdayDir}
                          onSort={toggleBday}
                        />
                        <SortableTh
                          label="Lawyer(s)"
                          columnKey="lawyers"
                          activeKey={bdayKey}
                          direction={bdayDir}
                          onSort={toggleBday}
                        />
                        <th>Greeting</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedBirthdays.map((row) => (
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
                          <td style={{ position: "relative", minWidth: "8rem" }}>
                            <Can
                              permissions={["crm.view", "crm.manage", "users.manage", "billing.manage"]}
                              mode="any"
                            >
                              <ClientEmailButton
                                clientId={row.clientId}
                                defaultEmail={row.email}
                                defaultSubject={`Happy Birthday, ${row.displayName}`}
                                buttonLabel="Send greeting"
                              />
                            </Can>
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
                        <SortableTh
                          label="Date"
                          columnKey="date"
                          activeKey={monthHolKey}
                          direction={monthHolDir}
                          onSort={toggleMonthHol}
                        />
                        <SortableTh
                          label="Holiday"
                          columnKey="holiday"
                          activeKey={monthHolKey}
                          direction={monthHolDir}
                          onSort={toggleMonthHol}
                        />
                        <SortableTh
                          label="Country"
                          columnKey="country"
                          activeKey={monthHolKey}
                          direction={monthHolDir}
                          onSort={toggleMonthHol}
                        />
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {sortedMonthHolidays.map((h) => (
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

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: "1.5rem",
                  gap: "0.75rem",
                  flexWrap: "wrap",
                }}
              >
                <h4 style={{ margin: 0 }}>Public holidays by year</h4>
                <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
                  <label className="muted" htmlFor="crm-holiday-year" style={{ fontSize: "0.85rem" }}>
                    Year
                  </label>
                  <select
                    id="crm-holiday-year"
                    className="filter-select"
                    value={holidayYear}
                    onChange={(e) => setHolidayYear(Number(e.target.value))}
                  >
                    {Array.from({ length: 7 }, (_, i) => new Date().getFullYear() - 1 + i).map(
                      (y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ),
                    )}
                  </select>
                </div>
              </div>
              <p className="muted" style={{ fontSize: "0.85rem" }}>
                Fixed Zimbabwe public holidays auto-seed for upcoming years. Edit names or dates
                below if your firm calendar differs.
              </p>

              {!yearHolidays.length ? (
                <p className="muted" style={{ fontSize: "0.85rem" }}>
                  No holidays recorded for {holidayYear}.
                </p>
              ) : (
                <div className="table-wrap">
                  <table className="data data-dense">
                    <thead>
                      <tr>
                        <SortableTh
                          label="Date"
                          columnKey="date"
                          activeKey={yearHolKey}
                          direction={yearHolDir}
                          onSort={toggleYearHol}
                        />
                        <SortableTh
                          label="Holiday"
                          columnKey="holiday"
                          activeKey={yearHolKey}
                          direction={yearHolDir}
                          onSort={toggleYearHol}
                        />
                        <SortableTh
                          label="Country"
                          columnKey="country"
                          activeKey={yearHolKey}
                          direction={yearHolDir}
                          onSort={toggleYearHol}
                        />
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {sortedYearHolidays.map((h) => (
                        <tr key={h.id}>
                          {editingHolidayId === h.id ? (
                            <>
                              <td>
                                <input
                                  type="date"
                                  value={editHolidayDate}
                                  onChange={(e) => setEditHolidayDate(e.target.value)}
                                  required
                                />
                              </td>
                              <td>
                                <input
                                  value={editHolidayName}
                                  onChange={(e) => setEditHolidayName(e.target.value)}
                                  required
                                  style={{ width: "100%" }}
                                />
                              </td>
                              <td>
                                <Badge tone="open">{h.country}</Badge>
                              </td>
                              <td>
                                <Can permission="crm.manage">
                                  <div style={{ display: "flex", gap: "0.35rem" }}>
                                    <Button
                                      size="sm"
                                      disabled={saving || !editHolidayName.trim()}
                                      onClick={() => void editHoliday(h.id)}
                                    >
                                      Save
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={saving}
                                      onClick={() => setEditingHolidayId(null)}
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                </Can>
                              </td>
                            </>
                          ) : (
                            <>
                              <td>{new Date(h.holidayDate).toLocaleDateString()}</td>
                              <td>{h.name}</td>
                              <td>
                                <Badge tone="open">{h.country}</Badge>
                              </td>
                              <td>
                                <Can permission="crm.manage">
                                  <div style={{ display: "flex", gap: "0.35rem" }}>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={saving}
                                      onClick={() => startEditHoliday(h)}
                                    >
                                      Edit
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={saving}
                                      onClick={() => void removeHoliday(h.id)}
                                    >
                                      Remove
                                    </Button>
                                  </div>
                                </Can>
                              </td>
                            </>
                          )}
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
