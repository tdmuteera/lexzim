"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Can } from "@/components/auth/Can";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SortableTh } from "@/components/ui/SortableTh";
import { centsToDisplay } from "@/lib/billing/money";
import { useTableSort } from "@/lib/ui/table-sort";

type Settings = {
  id: string;
  monthlyTargetCents: number;
  currency: string;
  commissionPercentAboveTarget: number;
  effectiveFrom: string;
};

type Metrics = {
  collectedCents: number;
  monthlyTargetCents: number;
  remainingToTargetCents: number;
  aboveTargetCents: number;
  commissionDueCents: number;
  commissionPercentAboveTarget: number;
};

type LawyerRow = Metrics & {
  lawyerId: string | null;
  lawyerName: string;
};

type Report = {
  month: string;
  currency: string;
  formulaHelp: string;
  attributionPolicy: string;
  configured: boolean;
  rows: LawyerRow[];
  totals: Metrics;
};

function currentMonthInput(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function CommissionView() {
  const [month, setMonth] = useState(currentMonthInput);
  const [report, setReport] = useState<Report | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [formulaHelp, setFormulaHelp] = useState("");
  const [targetDollars, setTargetDollars] = useState("3000");
  const [percent, setPercent] = useState("25");
  const [currency, setCurrency] = useState("USD");
  const [effectiveFrom, setEffectiveFrom] = useState(todayDate);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    const res = await fetch("/api/finance/commission/settings", { credentials: "include" });
    const body = (await res.json()) as {
      ok: boolean;
      data?: {
        settings: Settings | null;
        formulaHelp: string;
        defaults: {
          monthlyTargetDollars: number;
          commissionPercentAboveTarget: number;
          currency: string;
        };
      };
      error?: { message: string };
    };
    if (!res.ok || !body.ok || !body.data) {
      throw new Error(body.error?.message ?? "Could not load commission settings.");
    }
    setFormulaHelp(body.data.formulaHelp);
    const s = body.data.settings;
    setSettings(s);
    if (s) {
      setTargetDollars(String(s.monthlyTargetCents / 100));
      setPercent(String(s.commissionPercentAboveTarget));
      setCurrency(s.currency);
      setEffectiveFrom(s.effectiveFrom.slice(0, 10));
    } else {
      setTargetDollars(String(body.data.defaults.monthlyTargetDollars));
      setPercent(String(body.data.defaults.commissionPercentAboveTarget));
      setCurrency(body.data.defaults.currency);
    }
  }, []);

  const loadReport = useCallback(async (ym: string) => {
    const res = await fetch(`/api/finance/commission?month=${encodeURIComponent(ym)}`, {
      credentials: "include",
    });
    const body = (await res.json()) as {
      ok: boolean;
      data?: { report: Report };
      error?: { message: string };
    };
    if (!res.ok || !body.ok || !body.data) {
      throw new Error(body.error?.message ?? "Could not load commission report.");
    }
    setReport(body.data.report);
    if (body.data.report.formulaHelp) {
      setFormulaHelp(body.data.report.formulaHelp);
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadSettings(), loadReport(month)]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load commission.");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [loadReport, loadSettings, month]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function onSaveSettings(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/finance/commission/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthlyTargetDollars: targetDollars,
          commissionPercentAboveTarget: Number(percent),
          currency,
          effectiveFrom,
        }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { settings: Settings };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Could not save settings.");
        return;
      }
      setSettings(body.data.settings);
      setSuccess("Commission settings saved.");
      await loadReport(month);
    } catch {
      setError("Could not save settings.");
    } finally {
      setSaving(false);
    }
  }

  const currencyCode = report?.currency ?? currency ?? "USD";

  const commissionRows = report?.rows ?? [];
  const sortAccessors = useMemo(
    () => ({
      lawyer: (r: LawyerRow) => r.lawyerName,
      collected: (r: LawyerRow) => r.collectedCents,
      target: (r: LawyerRow) => r.monthlyTargetCents,
      remaining: (r: LawyerRow) => r.remainingToTargetCents,
      above: (r: LawyerRow) => r.aboveTargetCents,
      commission: (r: LawyerRow) => r.commissionDueCents,
    }),
    [],
  );
  const { sortedRows, sortKey, sortDir, toggleSort } = useTableSort(
    commissionRows,
    sortAccessors,
    { key: "lawyer", dir: "asc" },
  );

  return (
    <section className="view active scrollable finance-desk-view" aria-label="Commission">
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Commission</h3>
            <p className="panel-subtitle muted">
              Fee collection target · % above target · not payroll
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", alignItems: "center" }}>
            <Link href="/reports/lawyer-performance" className="btn btn-ghost btn-sm">
              Lawyer performance
            </Link>
            <Button size="sm" variant="outline" disabled={loading} onClick={() => void loadAll()}>
              {loading ? "Loading…" : "Refresh"}
            </Button>
          </div>
        </div>

        <div className="panel-body">
          <div className="finance-desk-callout" role="note">
            <div className="finance-desk-callout-title">How commission is calculated</div>
            <p>
              {formulaHelp ||
                "Commission due = (collected fee cash above the monthly target) × commission %. Trust deposits and disbursements do not count."}
            </p>
            <p className="finance-desk-callout-link">
              <Link href="/reports/lawyer-performance">Lawyer performance</Link>
              <span className="muted"> · same collected-fee basis · not a salary posting</span>
            </p>
          </div>

          {error ? (
            <div className="finance-status-banner finance-status-banner-error" role="alert">
              {error}
            </div>
          ) : null}
          {success ? (
            <div className="finance-status-banner finance-status-banner-ok" role="status">
              {success}
            </div>
          ) : null}

          <Can
            permission="finance.commission.configure"
            fallback={
              <div className="finance-intake-form">
                <div className="finance-intake-form-head">
                  <h4>Current settings</h4>
                  <p className="muted">
                    {settings
                      ? `Target ${centsToDisplay(settings.monthlyTargetCents, settings.currency)} / month · ${settings.commissionPercentAboveTarget}% above target · effective ${settings.effectiveFrom.slice(0, 10)}. Ask a managing partner to change settings.`
                      : "Commission is not configured yet. Ask a managing partner to set the monthly target and percent."}
                  </p>
                </div>
              </div>
            }
          >
            <form onSubmit={(e) => void onSaveSettings(e)} className="finance-intake-form">
              <div className="finance-intake-form-head">
                <h4>Configure target</h4>
                <p className="muted">
                  Example: target 3000, 25%, collected 4000 → commission due 250.
                </p>
              </div>
              <div className="finance-form-grid">
                <label>
                  <span>Monthly target ({currency})</span>
                  <input
                    className="filter-select"
                    type="number"
                    min={0}
                    step="0.01"
                    value={targetDollars}
                    onChange={(e) => setTargetDollars(e.target.value)}
                    required
                  />
                </label>
                <label>
                  <span>% above target</span>
                  <input
                    className="filter-select"
                    type="number"
                    min={0}
                    max={100}
                    step="0.1"
                    value={percent}
                    onChange={(e) => setPercent(e.target.value)}
                    required
                  />
                </label>
                <label>
                  <span>Currency</span>
                  <input
                    className="filter-select"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                    maxLength={3}
                    required
                  />
                </label>
                <label>
                  <span>Effective from</span>
                  <input
                    className="filter-select"
                    type="date"
                    value={effectiveFrom}
                    onChange={(e) => setEffectiveFrom(e.target.value)}
                    required
                  />
                </label>
              </div>
              <div className="finance-intake-form-foot">
                <Button type="submit" size="sm" disabled={saving}>
                  {saving ? "Saving…" : "Save settings"}
                </Button>
              </div>
            </form>
          </Can>

          <div className="toolbar finance-filter-toolbar">
            <label className="finance-filter-field">
              <span>Month</span>
              <input
                type="month"
                className="filter-select"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                aria-label="Commission month"
              />
            </label>
          </div>

          {!report?.configured && !loading ? (
            <EmptyState
              title="Configure a target first"
              detail="Set a monthly fee collection target and percent above target, then refresh this month’s lawyer rows."
            />
          ) : null}

          {report?.configured ? (
            <>
              <p className="muted" style={{ fontSize: "0.8rem", maxWidth: "52rem", marginTop: 0 }}>
                {report.attributionPolicy}
              </p>
              {report.rows.length === 0 ? (
                <EmptyState
                  title="No collected fees this month"
                  detail="Fee receipts attributed to a responsible lawyer will appear here."
                />
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
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
                          label="Collected"
                          columnKey="collected"
                          activeKey={sortKey}
                          direction={sortDir}
                          onSort={toggleSort}
                          className="num"
                          align="right"
                        />
                        <SortableTh
                          label="Target"
                          columnKey="target"
                          activeKey={sortKey}
                          direction={sortDir}
                          onSort={toggleSort}
                          className="num"
                          align="right"
                        />
                        <SortableTh
                          label="Remaining to target"
                          columnKey="remaining"
                          activeKey={sortKey}
                          direction={sortDir}
                          onSort={toggleSort}
                          className="num"
                          align="right"
                        />
                        <SortableTh
                          label="Above target"
                          columnKey="above"
                          activeKey={sortKey}
                          direction={sortDir}
                          onSort={toggleSort}
                          className="num"
                          align="right"
                        />
                        <SortableTh
                          label="Commission due"
                          columnKey="commission"
                          activeKey={sortKey}
                          direction={sortDir}
                          onSort={toggleSort}
                          className="num"
                          align="right"
                        />
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRows.map((r) => (
                        <tr key={r.lawyerId ?? "unassigned"}>
                          <td>{r.lawyerName}</td>
                          <td className="num">
                            {centsToDisplay(r.collectedCents, currencyCode)}
                          </td>
                          <td className="num">
                            {centsToDisplay(r.monthlyTargetCents, currencyCode)}
                          </td>
                          <td className="num">
                            {centsToDisplay(r.remainingToTargetCents, currencyCode)}
                          </td>
                          <td className="num">
                            {centsToDisplay(r.aboveTargetCents, currencyCode)}
                          </td>
                          <td className="num">
                            {centsToDisplay(r.commissionDueCents, currencyCode)}
                          </td>
                        </tr>
                      ))}
                      <tr>
                        <td>
                          <strong>Firm total collected</strong>
                        </td>
                        <td className="num">
                          <strong>
                            {centsToDisplay(report.totals.collectedCents, currencyCode)}
                          </strong>
                        </td>
                        <td colSpan={4} className="muted">
                          Target and commission apply per lawyer, not to the firm total.
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : null}

          {loading && !report ? (
            <p className="muted">Loading commission…</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
