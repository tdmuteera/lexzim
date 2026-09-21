"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SortableTh } from "@/components/ui/SortableTh";
import { centsToDisplay } from "@/lib/billing/money";
import { useTableSort } from "@/lib/ui/table-sort";

type AccountOption = { id: string; name: string; currency: string };

type ReconRun = {
  id: string;
  reconType: string;
  periodYear: number;
  periodMonth: number;
  trustAccountId: string | null;
  trustAccountName: string | null;
  statementBalanceCents: number;
  ledgerBalanceCents: number;
  varianceCents: number;
  status: string;
  notes: string | null;
  overrideReason: string | null;
  completedByName: string | null;
  completedAt: string | null;
};

type Preview = {
  trustAccountName: string | null;
  currency: string;
  accountBookBalanceCents: number;
  clientLedgerSumCents: number;
  clientBookVarianceCents: number;
};

type Tab = "trust_bank" | "trust_vault" | "history";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function periodLabel(year: number, month: number) {
  return `${MONTHS[month - 1] ?? month} ${year}`;
}

function reconTypeLabel(type: string) {
  if (type === "trust_bank") return "Trust bank";
  if (type === "trust_vault") return "Trust vault";
  if (type === "business_bank") return "Business bank";
  return type;
}

export function ReconciliationsView() {
  const { user } = useAuth();
  const isMp = user?.role?.code === "managing_partner";

  const [tab, setTab] = useState<Tab>("trust_bank");
  const [bankAccounts, setBankAccounts] = useState<AccountOption[]>([]);
  const [vaultAccounts, setVaultAccounts] = useState<AccountOption[]>([]);
  const [history, setHistory] = useState<ReconRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const now = new Date();
  const [periodYear, setPeriodYear] = useState(now.getFullYear());
  const [periodMonth, setPeriodMonth] = useState(now.getMonth() + 1);
  const [trustAccountId, setTrustAccountId] = useState("");
  const [statementDollars, setStatementDollars] = useState("");
  const [notes, setNotes] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);

  const activeReconType = tab === "trust_vault" ? "trust_vault" : "trust_bank";
  const accountOptions = tab === "trust_vault" ? vaultAccounts : bankAccounts;

  const loadHistory = useCallback(async () => {
    const res = await fetch("/api/finance/reconciliations", { credentials: "include" });
    const body = (await res.json()) as {
      ok: boolean;
      data?: {
        items: ReconRun[];
        accounts: { bank: AccountOption[]; vault: AccountOption[] };
      };
    };
    if (!res.ok || !body.ok || !body.data) {
      throw new Error("Could not load reconciliations.");
    }
    setHistory(body.data.items);
    setBankAccounts(body.data.accounts.bank);
    setVaultAccounts(body.data.accounts.vault);
    if (!trustAccountId) {
      const first = body.data.accounts.bank[0];
      if (first) setTrustAccountId(first.id);
    }
  }, [trustAccountId]);

  const loadPreview = useCallback(async () => {
    if (!trustAccountId || tab === "history") return;
    try {
      const params = new URLSearchParams({
        preview: "1",
        reconType: activeReconType,
        trustAccountId,
        periodYear: String(periodYear),
        periodMonth: String(periodMonth),
      });
      if (statementDollars) params.set("statementDollars", statementDollars);
      const res = await fetch(`/api/finance/reconciliations?${params}`, {
        credentials: "include",
      });
      const body = (await res.json()) as { ok: boolean; data?: { preview: Preview } };
      if (res.ok && body.ok && body.data?.preview) {
        setPreview(body.data.preview);
      }
    } catch {
      /* ignore preview errors */
    }
  }, [trustAccountId, activeReconType, periodYear, periodMonth, statementDollars, tab]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load.");
    } finally {
      setLoading(false);
    }
  }, [loadHistory]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (tab !== "history") {
      const opts = tab === "trust_vault" ? vaultAccounts : bankAccounts;
      if (opts.length && !opts.find((a) => a.id === trustAccountId)) {
        setTrustAccountId(opts[0]?.id ?? "");
      }
      void loadPreview();
    }
  }, [tab, trustAccountId, periodYear, periodMonth, statementDollars, vaultAccounts, bankAccounts, loadPreview]);

  const statementCents = statementDollars
    ? Math.round(Number(statementDollars) * 100)
    : null;
  const ledgerCents = preview?.accountBookBalanceCents ?? 0;
  const varianceCents =
    statementCents !== null && !Number.isNaN(statementCents)
      ? statementCents - ledgerCents
      : null;
  const currency = preview?.currency ?? accountOptions[0]?.currency ?? "USD";

  async function saveDraft(e?: FormEvent): Promise<string | null> {
    e?.preventDefault();
    if (!trustAccountId || statementCents === null || Number.isNaN(statementCents)) {
      setError("Enter a statement balance.");
      return null;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        reconType: activeReconType,
        periodYear,
        periodMonth,
        trustAccountId,
        statementDollars,
        notes: notes || null,
      };
      const url = draftId
        ? `/api/finance/reconciliations/${draftId}`
        : "/api/finance/reconciliations";
      const res = await fetch(url, {
        method: draftId ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { run: ReconRun };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data?.run) {
        setError(body.error?.message ?? "Could not save draft.");
        return null;
      }
      setDraftId(body.data.run.id);
      await loadHistory();
      return body.data.run.id;
    } catch {
      setError("Could not save draft.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function completeRun() {
    const id = draftId ?? (await saveDraft());
    if (!id) return;

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/finance/reconciliations/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "complete",
          overrideReason: overrideReason || null,
        }),
      });
      const body = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not complete reconciliation.");
        return;
      }
      setDraftId(null);
      setStatementDollars("");
      setNotes("");
      setOverrideReason("");
      await load();
      setTab("history");
    } catch {
      setError("Could not complete reconciliation.");
    } finally {
      setSaving(false);
    }
  }

  const historyAccessors = useMemo(
    () => ({
      period: (r: ReconRun) => `${r.periodYear}-${String(r.periodMonth).padStart(2, "0")}`,
      type: (r: ReconRun) => reconTypeLabel(r.reconType),
      account: (r: ReconRun) => r.trustAccountName ?? "",
      statement: (r: ReconRun) => r.statementBalanceCents,
      book: (r: ReconRun) => r.ledgerBalanceCents,
      variance: (r: ReconRun) => r.varianceCents,
      status: (r: ReconRun) => r.status,
    }),
    [],
  );
  const {
    sortedRows: sortedHistory,
    sortKey,
    sortDir,
    toggleSort,
  } = useTableSort(history, historyAccessors, { key: "period", dir: "desc" });

  return (
    <section className="view active scrollable finance-desk-view" aria-label="Reconciliations">
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Reconciliations</h3>
            <p className="panel-subtitle muted">Trust bank three-way · vault count · history</p>
          </div>
        </div>
        <div className="panel-body">
          <div className="finance-desk-callout trust-desk-callout" role="note">
            <div className="finance-desk-callout-title">Month-end trust discipline</div>
            <p>
              <strong>A</strong> Bank statement balance (manual entry).{" "}
              <strong>B</strong> LexZim book balance on the trust account.{" "}
              <strong>C</strong> Spot-check client trust statements in Finance → Trust.
              Vault reconciliation is separate from bank three-way.
            </p>
            <p className="finance-desk-callout-link">
              Completion is blocked when variance ≠ 0 unless the Managing Partner records an audited override reason.
            </p>
          </div>

          <div className="toolbar" style={{ marginBottom: "0.75rem" }}>
            <Button size="sm" variant={tab === "trust_bank" ? "primary" : "outline"} onClick={() => setTab("trust_bank")}>
              Trust bank
            </Button>
            <Button size="sm" variant={tab === "trust_vault" ? "primary" : "outline"} onClick={() => setTab("trust_vault")}>
              Vault
            </Button>
            <Button size="sm" variant={tab === "history" ? "primary" : "outline"} onClick={() => setTab("history")}>
              History
            </Button>
            <span className="toolbar-spacer" />
            <Button size="sm" variant="outline" onClick={() => load()} disabled={loading}>
              Refresh
            </Button>
          </div>

          {error ? (
            <p role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem" }}>{error}</p>
          ) : null}

          {tab !== "history" ? (
            <>
              {!accountOptions.length ? (
                <EmptyState
                  title="No trust account"
                  detail="Create a bank or vault trust account under Finance → Trust → Accounts."
                />
              ) : (
                <form onSubmit={saveDraft} className="panel" style={{ padding: "1rem", marginBottom: "1rem" }}>
                  <h4 style={{ marginTop: 0 }}>
                    {tab === "trust_vault" ? "Vault reconciliation" : "Trust bank three-way"}
                  </h4>
                  <div className="grid-2">
                    <div className="form-group">
                      <label htmlFor="recon-period">Period</label>
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <select value={periodMonth} onChange={(e) => setPeriodMonth(Number(e.target.value))}>
                          {MONTHS.map((m, i) => (
                            <option key={m} value={i + 1}>{m}</option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min={2000}
                          max={2100}
                          value={periodYear}
                          onChange={(e) => setPeriodYear(Number(e.target.value))}
                          style={{ width: "5rem" }}
                        />
                      </div>
                    </div>
                    <div className="form-group">
                      <label htmlFor="recon-acct">Account</label>
                      <select
                        id="recon-acct"
                        value={trustAccountId}
                        onChange={(e) => {
                          setTrustAccountId(e.target.value);
                          setDraftId(null);
                        }}
                      >
                        {accountOptions.map((a) => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {preview ? (
                    <div className="recon-preview-grid">
                      <div className="recon-preview-card">
                        <span className="recon-preview-label">B · Book balance</span>
                        <strong>{centsToDisplay(preview.accountBookBalanceCents, preview.currency)}</strong>
                      </div>
                      <div className="recon-preview-card">
                        <span className="recon-preview-label">C · Client ledger sum</span>
                        <strong>{centsToDisplay(preview.clientLedgerSumCents, preview.currency)}</strong>
                        {preview.clientBookVarianceCents !== 0 ? (
                          <span className="finance-ageing-hint">
                            Book vs client: {centsToDisplay(preview.clientBookVarianceCents, preview.currency)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  <div className="form-group">
                    <label htmlFor="recon-stmt">
                      A · {tab === "trust_vault" ? "Counted cash" : "Bank statement balance"} ({currency})
                    </label>
                    <input
                      id="recon-stmt"
                      type="number"
                      step="0.01"
                      value={statementDollars}
                      onChange={(e) => setStatementDollars(e.target.value)}
                      required
                    />
                  </div>

                  {varianceCents !== null ? (
                    <div
                      className={varianceCents !== 0 ? "finance-overdue-banner" : "recon-variance-ok"}
                      role="status"
                    >
                      Variance (A − B): <strong>{centsToDisplay(varianceCents, currency)}</strong>
                    </div>
                  ) : null}

                  <div className="form-group">
                    <label htmlFor="recon-notes">Notes</label>
                    <textarea id="recon-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
                  </div>

                  {varianceCents !== 0 && varianceCents !== null ? (
                    <div className="form-group">
                      <label htmlFor="recon-override">MP override reason (required if completing with variance)</label>
                      <input
                        id="recon-override"
                        value={overrideReason}
                        onChange={(e) => setOverrideReason(e.target.value)}
                        disabled={!isMp}
                        placeholder={isMp ? "Explain variance for audit trail" : "Managing Partner only"}
                      />
                    </div>
                  ) : null}

                  <p className="muted" style={{ fontSize: "0.8rem" }}>
                    <Link href="/finance/trust">Open Trust</Link> to spot-check client statements (view C).
                  </p>

                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    <Button type="submit" size="sm" disabled={saving}>
                      {saving ? "Saving…" : draftId ? "Update draft" : "Save draft"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={saving || !statementDollars}
                      onClick={() => void completeRun()}
                    >
                      Mark completed
                    </Button>
                  </div>
                </form>
              )}
            </>
          ) : (
            <>
              {!history.length ? (
                <EmptyState title="No reconciliation runs" detail="Save a draft from Trust bank or Vault tabs." />
              ) : (
                <table className="data data-dense">
                  <thead>
                    <tr>
                      <SortableTh label="Period" columnKey="period" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                      <SortableTh label="Type" columnKey="type" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                      <SortableTh label="Account" columnKey="account" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                      <SortableTh label="Statement" columnKey="statement" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                      <SortableTh label="Book" columnKey="book" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                      <SortableTh label="Variance" columnKey="variance" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                      <SortableTh label="Status" columnKey="status" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedHistory.map((row) => (
                      <tr key={row.id}>
                        <td>{periodLabel(row.periodYear, row.periodMonth)}</td>
                        <td>{reconTypeLabel(row.reconType)}</td>
                        <td>{row.trustAccountName ?? "n/a"}</td>
                        <td>{centsToDisplay(row.statementBalanceCents, currency)}</td>
                        <td>{centsToDisplay(row.ledgerBalanceCents, currency)}</td>
                        <td className={row.varianceCents !== 0 ? "finance-ageing-hint" : ""}>
                          {centsToDisplay(row.varianceCents, currency)}
                        </td>
                        <td>
                          <Badge tone={row.status === "completed" ? "open" : "pending"}>
                            {row.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
