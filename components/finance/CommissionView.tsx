"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Can } from "@/components/auth/Can";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { centsToDisplay } from "@/lib/billing/money";

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

  return (
    <section className="view active scrollable" aria-label="Commission">
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Commission</h3>
            <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>
              Lawyer commission on collected fee revenue above a monthly target. Not payroll.
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <Link href="/reports/lawyer-performance" className="btn btn-ghost btn-sm">
              Lawyer performance
            </Link>
            <Button size="sm" disabled={loading} onClick={() => void loadAll()}>
              {loading ? "Loading…" : "Refresh"}
            </Button>
          </div>
        </div>
        <div className="panel-body">
          <p className="muted" style={{ fontSize: "0.8rem", maxWidth: "48rem" }}>
            {formulaHelp ||
              "Commission due = (collected fee cash above monthly target) × %. Trust and disbursements excluded."}
          </p>

          {error ? (
            <p role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem" }}>
              {error}
            </p>
          ) : null}
          {success ? (
            <p style={{ color: "var(--success, #2d6a4f)", fontSize: "0.85rem" }}>{success}</p>
          ) : null}

          <Can
            permission="finance.commission.configure"
            fallback={
              settings ? (
                <p className="muted" style={{ fontSize: "0.85rem" }}>
                  Current target: {centsToDisplay(settings.monthlyTargetCents, settings.currency)} / month;
                  commission {settings.commissionPercentAboveTarget}% above target (effective{" "}
                  {settings.effectiveFrom.slice(0, 10)}). Ask a managing partner to change settings.
                </p>
              ) : (
                <p className="muted" style={{ fontSize: "0.85rem" }}>
                  Commission is not configured yet. Ask a managing partner to set the monthly target and
                  percent.
                </p>
              )
            }
          >
            <form
              onSubmit={(e) => void onSaveSettings(e)}
              className="toolbar"
              style={{
                flexWrap: "wrap",
                gap: "0.65rem",
                alignItems: "flex-end",
                marginBottom: "1rem",
                padding: "0.75rem",
                border: "1px solid var(--border, #ddd)",
                borderRadius: "6px",
              }}
            >
              <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.8rem" }}>
                Monthly target ({currency})
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
              <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.8rem" }}>
                % above target
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
              <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.8rem" }}>
                Currency
                <input
                  className="filter-select"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  maxLength={3}
                  required
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.8rem" }}>
                Effective from
                <input
                  className="filter-select"
                  type="date"
                  value={effectiveFrom}
                  onChange={(e) => setEffectiveFrom(e.target.value)}
                  required
                />
              </label>
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? "Saving…" : "Save settings"}
              </Button>
            </form>
          </Can>

          <div className="toolbar" style={{ flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.75rem" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem" }}>
              Month
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
              <p className="muted" style={{ fontSize: "0.8rem", maxWidth: "52rem" }}>
                {report.attributionPolicy}
              </p>
              {report.rows.length === 0 ? (
                <EmptyState
                  title="No collected fees this month"
                  detail="Fee receipts attributed to a responsible lawyer will appear here."
                />
              ) : (
                <table className="data">
                  <thead>
                    <tr>
                      <th>Lawyer</th>
                      <th>Collected</th>
                      <th>Target</th>
                      <th>Remaining to target</th>
                      <th>Above target</th>
                      <th>Commission due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((r) => (
                      <tr key={r.lawyerId ?? "unassigned"}>
                        <td>{r.lawyerName}</td>
                        <td>{centsToDisplay(r.collectedCents, currencyCode)}</td>
                        <td>{centsToDisplay(r.monthlyTargetCents, currencyCode)}</td>
                        <td>{centsToDisplay(r.remainingToTargetCents, currencyCode)}</td>
                        <td>{centsToDisplay(r.aboveTargetCents, currencyCode)}</td>
                        <td>{centsToDisplay(r.commissionDueCents, currencyCode)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td>
                        <strong>Firm total collected</strong>
                      </td>
                      <td>
                        <strong>{centsToDisplay(report.totals.collectedCents, currencyCode)}</strong>
                      </td>
                      <td colSpan={4} className="muted" style={{ fontSize: "0.8rem" }}>
                        Target and commission apply per lawyer, not to the firm total.
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}
            </>
          ) : null}

          {loading && !report ? (
            <p className="muted" style={{ fontSize: "0.85rem" }}>
              Loading commission…
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
