"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { Can } from "@/components/auth/Can";
import { ExportMenu } from "@/components/export/ExportMenu";
import { ReasonActionButton } from "@/components/finance/ReasonActionButton";
import { ClientTransferModal } from "@/components/trust/ClientTransferModal";
import { TrustMoneyCallout } from "@/components/trust/TrustMoneyCallout";
import { TrustVaultPanel } from "@/components/trust/TrustVaultPanel";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SortableTh } from "@/components/ui/SortableTh";
import { centsToDisplay } from "@/lib/billing/money";
import type { TrustClientBalanceRow, TrustOverview } from "@/lib/repos/trust";
import { TRUST_ENTRY_TYPES, type TrustEntryType } from "@/lib/trust/validation";
import { useTableSort } from "@/lib/ui/table-sort";

type Account = {
  id: string;
  name: string;
  currency: string;
  accountRef: string | null;
  accountKind: string;
  isActive: boolean;
  balanceCents: number;
};

type LedgerItem = {
  id: string;
  entryType: string;
  amountCents: number;
  currency: string;
  occurredAt: string;
  reference: string | null;
  narrative: string | null;
  accountName: string | null;
  clientDisplayName: string | null;
  matterTitle: string | null;
  clientId: string | null;
  runningBalanceCents?: number;
  sourceType?: string | null;
  reversalOfId?: string | null;
  reversedById?: string | null;
  reversalReason?: string | null;
  transferGroupId?: string | null;
};

type ClientOption = { id: string; displayLabel: string; clientNumber: string | null };
type MatterOption = { id: string; title: string; matterNumber: string | null };

type Tab = "overview" | "vault" | "ledger" | "accounts" | "statement";

function todayInput() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function accountKindLabel(kind: string) {
  return kind === "vault" ? "Vault (cash)" : "Bank";
}

const LEDGER_REVERSIBLE_SOURCES = ["manual", "client_transfer", "vault_bank_in", "invoice_fee"];
const SOURCE_REVERSAL_HINT: Record<string, string> = {
  intake: "Reverse from Payments",
  intake_fee: "Reverse from Payments",
  requisition: "Reverse from Requisitions",
  opening_balance: "Opening balance",
};

function LedgerRowAction({ row, onDone }: { row: LedgerItem; onDone: () => void | Promise<void> }) {
  if (row.reversedById) return <Badge tone="closed">Reversed</Badge>;
  if (row.reversalOfId) return null;
  const source = row.sourceType ?? "manual";
  if (!LEDGER_REVERSIBLE_SOURCES.includes(source)) {
    const hint = SOURCE_REVERSAL_HINT[source];
    return hint ? (
      <span className="muted" style={{ fontSize: "0.72rem" }}>
        {hint}
      </span>
    ) : null;
  }
  const isTransfer = source === "client_transfer" || Boolean(row.transferGroupId);
  return (
    <Can permission="trust.manage">
      <ReasonActionButton
        label="Reverse"
        title="Reverse trust entry"
        explanation={
          isTransfer
            ? "Posts contra entries for every leg of this transfer. The originals stay on the ledger and are marked reversed. Client to client transfers need the Managing Partner."
            : "Posts a contra entry for this amount. The original stays on the ledger and is marked reversed. It will not go through if a client ledger would drop below zero."
        }
        url={`/api/trust/ledger/${row.id}/reverse`}
        successMessage="Trust entry reversed."
        onDone={onDone}
        variant="ghost"
      />
    </Can>
  );
}

export function TrustView() {
  const [tab, setTab] = useState<Tab>("overview");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [overview, setOverview] = useState<TrustOverview | null>(null);
  const [ledger, setLedger] = useState<LedgerItem[]>([]);
  const [clientLedger, setClientLedger] = useState<LedgerItem[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [matters, setMatters] = useState<MatterOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [accountFilter, setAccountFilter] = useState("");
  const [clientFilter, setClientFilter] = useState("");

  const [postOpen, setPostOpen] = useState(false);
  const [entryType, setEntryType] = useState<TrustEntryType>("receipt");
  const [trustAccountId, setTrustAccountId] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [clientId, setClientId] = useState("");
  const [matterId, setMatterId] = useState("");
  const [amountDollars, setAmountDollars] = useState("");
  const [occurredAt, setOccurredAt] = useState(todayInput);
  const [reference, setReference] = useState("");
  const [narrative, setNarrative] = useState("");
  const [allowNegative, setAllowNegative] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [clientTransferOpen, setClientTransferOpen] = useState(false);
  const [adjustmentCredit, setAdjustmentCredit] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [newAccountOpen, setNewAccountOpen] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [accountRef, setAccountRef] = useState("");
  const [accountKind, setAccountKind] = useState<"bank" | "vault">("bank");

  const [statementClientId, setStatementClientId] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [clientSearchResults, setClientSearchResults] = useState<ClientOption[]>([]);
  const [openTrustClientId, setOpenTrustClientId] = useState("");
  const [openTrustSearch, setOpenTrustSearch] = useState("");
  const [statement, setStatement] = useState<{
    balanceCents: number;
    currency: string;
    lines: LedgerItem[];
    clientName: string;
  } | null>(null);

  const loadAccounts = useCallback(async () => {
    const res = await fetch("/api/trust/accounts?active=all", { credentials: "include" });
    const body = (await res.json()) as {
      ok: boolean;
      data?: { items: Account[] };
      error?: { message: string };
    };
    if (!res.ok || !body.ok) throw new Error(body.error?.message ?? "Accounts failed");
    setAccounts(body.data?.items ?? []);
    if (!trustAccountId && body.data?.items?.[0]) {
      setTrustAccountId(body.data.items.find((a) => a.isActive)?.id || body.data.items[0].id);
    }
  }, [trustAccountId]);

  const loadOverview = useCallback(async () => {
    const res = await fetch("/api/trust/overview", { credentials: "include" });
    const body = (await res.json()) as {
      ok: boolean;
      data?: { overview: TrustOverview };
      error?: { message: string };
    };
    if (!res.ok || !body.ok) throw new Error(body.error?.message ?? "Overview failed");
    setOverview(body.data?.overview ?? null);
  }, []);

  const loadLedger = useCallback(async () => {
    const params = new URLSearchParams();
    if (accountFilter) params.set("trustAccountId", accountFilter);
    if (clientFilter) params.set("clientId", clientFilter);
    const res = await fetch(`/api/trust/ledger?${params}`, { credentials: "include" });
    const body = (await res.json()) as {
      ok: boolean;
      data?: { items: LedgerItem[] };
      error?: { message: string };
    };
    if (!res.ok || !body.ok) throw new Error(body.error?.message ?? "Ledger failed");
    setLedger(body.data?.items ?? []);
  }, [accountFilter, clientFilter]);

  const loadClientLedger = useCallback(async (id: string) => {
    const res = await fetch(`/api/trust/clients/${id}/statement`, { credentials: "include" });
    const body = (await res.json()) as {
      ok: boolean;
      data?: { lines: LedgerItem[] };
      error?: { message: string };
    };
    if (!res.ok || !body.ok) throw new Error(body.error?.message ?? "Client ledger failed");
    setClientLedger(body.data?.lines ?? []);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await loadAccounts();
      await loadOverview();
      await loadLedger();
      if (clientFilter) {
        await loadClientLedger(clientFilter);
      } else {
        setClientLedger([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load trust.");
    } finally {
      setLoading(false);
    }
  }, [loadAccounts, loadOverview, loadLedger, loadClientLedger, clientFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cRes, mRes] = await Promise.all([
          fetch("/api/clients?archived=active", { credentials: "include" }),
          fetch("/api/matters?bucket=all", { credentials: "include" }),
        ]);
        if (cRes.ok) {
          const cBody = (await cRes.json()) as {
            data?: { items?: Array<{ id: string; displayLabel: string; displayName: string; clientNumber: string | null }> };
          };
          if (!cancelled) {
            setClients(
              (cBody.data?.items ?? []).map((c) => ({
                id: c.id,
                displayLabel: c.displayLabel ?? c.displayName,
                clientNumber: c.clientNumber ?? null,
              })),
            );
          }
        }
        if (mRes.ok) {
          const mBody = (await mRes.json()) as {
            data?: { items?: MatterOption[] };
          };
          if (!cancelled) setMatters(mBody.data?.items ?? []);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const query = clientSearch.trim() || openTrustSearch.trim();
    if (!query) {
      setClientSearchResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void fetch(`/api/clients?q=${encodeURIComponent(query)}&archived=active`, {
        credentials: "include",
      })
        .then((res) => res.json())
        .then(
          (body: {
            ok?: boolean;
            data?: {
              items?: Array<{
                id: string;
                displayLabel: string;
                displayName: string;
                clientNumber: string | null;
              }>;
            };
          }) => {
            if (cancelled || !body.ok || !body.data?.items) return;
            setClientSearchResults(
              body.data.items.map((c) => ({
                id: c.id,
                displayLabel: c.displayLabel ?? c.displayName,
                clientNumber: c.clientNumber ?? null,
              })),
            );
          },
        )
        .catch(() => {
          /* ignore */
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [clientSearch, openTrustSearch]);

  function clientLabel(c: ClientOption) {
    return c.clientNumber ? `${c.clientNumber} · ${c.displayLabel}` : c.displayLabel;
  }

  function startTrustForClient(id: string) {
    setClientId(id);
    setOpenTrustClientId(id);
    setEntryType("receipt");
    setPostOpen(true);
    setTab("ledger");
  }

  async function createAccount(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch("/api/trust/accounts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: accountName,
          accountRef: accountRef || null,
          accountKind,
        }),
      });
      const body = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setFormError(body.error?.message ?? "Could not create account.");
        return;
      }
      setNewAccountOpen(false);
      setAccountName("");
      setAccountRef("");
      await load();
    } catch {
      setFormError("Could not create account.");
    } finally {
      setSaving(false);
    }
  }

  async function postEntry(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch("/api/trust/ledger", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryType,
          trustAccountId,
          transferToAccountId: entryType === "transfer" ? transferTo : null,
          clientId: clientId || null,
          matterId: matterId || null,
          amountDollars,
          occurredAt: new Date(`${occurredAt}T12:00:00`).toISOString(),
          reference: reference || null,
          narrative: narrative || null,
          allowNegative,
          overrideReason: allowNegative ? overrideReason.trim() || null : null,
          adjustmentCredit,
        }),
      });
      const body = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setFormError(body.error?.message ?? "Could not post entry.");
        return;
      }
      setPostOpen(false);
      setAmountDollars("");
      setNarrative("");
      setReference("");
      setAllowNegative(false);
      setOverrideReason("");
      await load();
    } catch {
      setFormError("Could not post entry.");
    } finally {
      setSaving(false);
    }
  }

  async function loadStatement() {
    if (!statementClientId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/trust/clients/${statementClientId}/statement`, {
        credentials: "include",
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: {
          client: { displayName: string };
          balanceCents: number;
          currency: string;
          lines: LedgerItem[];
        };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Could not load statement.");
        setStatement(null);
        return;
      }
      setStatement({
        clientName: body.data.client.displayName,
        balanceCents: body.data.balanceCents,
        currency: body.data.currency,
        lines: body.data.lines,
      });
    } catch {
      setError("Could not load statement.");
    } finally {
      setSaving(false);
    }
  }

  function openClientLedger(clientIdValue: string) {
    setClientFilter(clientIdValue);
    setTab("ledger");
  }

  function openClientStatement(clientIdValue: string) {
    setStatementClientId(clientIdValue);
    setTab("statement");
    void (async () => {
      setSaving(true);
      try {
        const res = await fetch(`/api/trust/clients/${clientIdValue}/statement`, {
          credentials: "include",
        });
        const body = (await res.json()) as {
          ok: boolean;
          data?: {
            client: { displayName: string };
            balanceCents: number;
            currency: string;
            lines: LedgerItem[];
          };
        };
        if (res.ok && body.ok && body.data) {
          setStatement({
            clientName: body.data.client.displayName,
            balanceCents: body.data.balanceCents,
            currency: body.data.currency,
            lines: body.data.lines,
          });
        }
      } finally {
        setSaving(false);
      }
    })();
  }

  const activeAccounts = accounts.filter((a) => a.isActive);
  const bankAccounts = overview?.accounts.filter((a) => a.accountKind === "bank") ?? [];
  const vaultAccounts = overview?.accounts.filter((a) => a.accountKind === "vault") ?? [];
  const ledgerRows = clientFilter && clientLedger.length ? clientLedger : ledger;
  const ledgerShowsRunning = Boolean(clientFilter && clientLedger.length);

  const clientBalances = overview?.clientBalances ?? [];
  const balanceAccessors = useMemo(
    () => ({
      client: (r: TrustClientBalanceRow) => r.clientName,
      balance: (r: TrustClientBalanceRow) => r.balanceCents,
    }),
    [],
  );
  const {
    sortedRows: sortedBalances,
    sortKey: balKey,
    sortDir: balDir,
    toggleSort: toggleBal,
  } = useTableSort(clientBalances, balanceAccessors, { key: "client", dir: "asc" });

  const accountAccessors = useMemo(
    () => ({
      name: (r: Account) => r.name,
      type: (r: Account) => accountKindLabel(r.accountKind),
      reference: (r: Account) => r.accountRef ?? "",
      balance: (r: Account) => r.balanceCents,
      status: (r: Account) => (r.isActive ? "Active" : "Inactive"),
    }),
    [],
  );
  const {
    sortedRows: sortedAccounts,
    sortKey: acctKey,
    sortDir: acctDir,
    toggleSort: toggleAcct,
  } = useTableSort(accounts, accountAccessors, { key: "name", dir: "asc" });

  const ledgerAccessors = useMemo(
    () => ({
      when: (r: LedgerItem) => r.occurredAt,
      type: (r: LedgerItem) => r.entryType,
      client: (r: LedgerItem) => r.clientDisplayName ?? "",
      account: (r: LedgerItem) => r.accountName ?? "",
      amount: (r: LedgerItem) => r.amountCents,
      running: (r: LedgerItem) => r.runningBalanceCents ?? 0,
      detail: (r: LedgerItem) => r.narrative ?? r.reference ?? "",
    }),
    [],
  );
  const {
    sortedRows: sortedLedger,
    sortKey: ledKey,
    sortDir: ledDir,
    toggleSort: toggleLed,
  } = useTableSort(ledgerRows, ledgerAccessors, { key: "when", dir: "desc" });

  const statementLines = statement?.lines ?? [];
  const statementAccessors = useMemo(
    () => ({
      when: (r: LedgerItem) => r.occurredAt,
      type: (r: LedgerItem) => r.entryType,
      amount: (r: LedgerItem) => r.amountCents,
      running: (r: LedgerItem) => r.runningBalanceCents ?? 0,
      detail: (r: LedgerItem) =>
        [r.accountName, r.narrative].filter(Boolean).join(" · "),
    }),
    [],
  );
  const {
    sortedRows: sortedStatement,
    sortKey: stmtKey,
    sortDir: stmtDir,
    toggleSort: toggleStmt,
  } = useTableSort(statementLines, statementAccessors, { key: "when", dir: "asc" });

  return (
    <section className="view active scrollable finance-desk-view trust-desk-view" aria-label="Trust">
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Trust</h3>
            <p className="panel-subtitle muted">Client money · not fee revenue</p>
          </div>
          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", alignItems: "center" }}>
            <Link href="/finance/payments" className="btn btn-ghost btn-sm">
              Payments
            </Link>
            <Link href="/finance/client-accounts" className="btn btn-ghost btn-sm">
              Client accounts
            </Link>
            <Can permission="trust.manage">
              <Button size="sm" variant="outline" onClick={() => setNewAccountOpen(true)}>
                New account
              </Button>
              <Button size="sm" variant="outline" onClick={() => setClientTransferOpen(true)}>
                Transfer between clients
              </Button>
              <Button size="sm" onClick={() => setPostOpen(true)}>
                Post entry
              </Button>
            </Can>
            <ClientTransferModal
              open={clientTransferOpen}
              onClose={() => setClientTransferOpen(false)}
              onDone={() => load()}
              accounts={accounts}
              clients={clients}
            />
          </div>
        </div>
        <div className="panel-body">
          <TrustMoneyCallout />

          <div className="toolbar" style={{ marginBottom: "0.75rem" }}>
            <Button
              size="sm"
              variant={tab === "overview" ? "primary" : "outline"}
              onClick={() => setTab("overview")}
            >
              Overview
            </Button>
            <Button
              size="sm"
              variant={tab === "vault" ? "primary" : "outline"}
              onClick={() => setTab("vault")}
            >
              Vault (cash)
            </Button>
            <Button
              size="sm"
              variant={tab === "ledger" ? "primary" : "outline"}
              onClick={() => setTab("ledger")}
            >
              Ledger
            </Button>
            <Button
              size="sm"
              variant={tab === "accounts" ? "primary" : "outline"}
              onClick={() => setTab("accounts")}
            >
              Accounts
            </Button>
            <Button
              size="sm"
              variant={tab === "statement" ? "primary" : "outline"}
              onClick={() => setTab("statement")}
            >
              Client statement
            </Button>
            <span className="toolbar-spacer" />
            <Button size="sm" variant="outline" onClick={() => load()} disabled={loading}>
              Refresh
            </Button>
          </div>

          {error ? (
            <p role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem" }}>
              {error}
            </p>
          ) : null}

          {newAccountOpen ? (
            <form
              onSubmit={createAccount}
              className="panel"
              style={{ padding: "1rem", marginBottom: "1rem" }}
            >
              <h4 style={{ marginTop: 0 }}>New trust account</h4>
              {formError ? (
                <p role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem" }}>
                  {formError}
                </p>
              ) : null}
              <div className="form-group">
                <label htmlFor="ta-name">Name</label>
                <input
                  id="ta-name"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="ta-kind">Account type</label>
                <select
                  id="ta-kind"
                  value={accountKind}
                  onChange={(e) => setAccountKind(e.target.value as "bank" | "vault")}
                >
                  <option value="bank">Bank (master trust bank)</option>
                  <option value="vault">Vault (physical cash)</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="ta-ref">Bank / book reference</label>
                <input
                  id="ta-ref"
                  value={accountRef}
                  onChange={(e) => setAccountRef(e.target.value)}
                />
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <Button type="submit" size="sm" disabled={saving}>
                  Save
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setNewAccountOpen(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : null}

          {postOpen ? (
            <form
              onSubmit={postEntry}
              className="panel"
              style={{ padding: "1rem", marginBottom: "1rem" }}
            >
              <h4 style={{ marginTop: 0 }}>Post trust entry</h4>
              <p className="muted" style={{ fontSize: "0.8rem", marginTop: 0 }}>
                Trust ledger only. To record a fee receipt, use Finance → Invoicing.
              </p>
              {formError ? (
                <p role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem" }}>
                  {formError}
                </p>
              ) : null}
              <div className="grid-2">
                <div className="form-group">
                  <label htmlFor="te-type">Type</label>
                  <select
                    id="te-type"
                    value={entryType}
                    onChange={(e) => setEntryType(e.target.value as TrustEntryType)}
                  >
                    {TRUST_ENTRY_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="te-acct">Trust account</label>
                  <select
                    id="te-acct"
                    value={trustAccountId}
                    onChange={(e) => setTrustAccountId(e.target.value)}
                    required
                  >
                    {activeAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {entryType === "transfer" ? (
                <div className="form-group">
                  <label htmlFor="te-to">Transfer to</label>
                  <select
                    id="te-to"
                    value={transferTo}
                    onChange={(e) => setTransferTo(e.target.value)}
                    required
                  >
                    <option value="">Select account</option>
                    {activeAccounts
                      .filter((a) => a.id !== trustAccountId)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                </div>
              ) : null}
              <div className="grid-2">
                <div className="form-group">
                  <label htmlFor="te-client">Client</label>
                  {entryType !== "transfer" ? (
                    <>
                      <input
                        id="te-client-search"
                        value={clientSearch}
                        onChange={(e) => setClientSearch(e.target.value)}
                        placeholder="Search CL number or name"
                      />
                      <select
                        id="te-client"
                        value={clientId}
                        onChange={(e) => setClientId(e.target.value)}
                        required
                        style={{ marginTop: "0.35rem" }}
                      >
                        <option value="">Select client</option>
                        {(clientSearch.trim() ? clientSearchResults : clients).map((c) => (
                          <option key={c.id} value={c.id}>
                            {clientLabel(c)}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : (
                    <select
                      id="te-client"
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                    >
                      <option value="">Optional for transfer</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {clientLabel(c)}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="form-group">
                  <label htmlFor="te-matter">Matter (optional)</label>
                  <select
                    id="te-matter"
                    value={matterId}
                    onChange={(e) => setMatterId(e.target.value)}
                  >
                    <option value="">None</option>
                    {matters.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.matterNumber ? `${m.matterNumber} · ${m.title}` : m.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label htmlFor="te-amt">Amount</label>
                  <input
                    id="te-amt"
                    type="number"
                    min={0.01}
                    step="0.01"
                    value={amountDollars}
                    onChange={(e) => setAmountDollars(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="te-when">Occurred</label>
                  <input
                    id="te-when"
                    type="date"
                    value={occurredAt}
                    onChange={(e) => setOccurredAt(e.target.value)}
                    required
                  />
                </div>
              </div>
              {entryType === "adjustment" ? (
                <div className="form-group">
                  <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={adjustmentCredit}
                      onChange={(e) => setAdjustmentCredit(e.target.checked)}
                    />
                    Credit (increase client trust balance)
                  </label>
                </div>
              ) : null}
              <div className="form-group">
                <label htmlFor="te-ref">
                  Reference number
                  {entryType === "receipt" || entryType === "disbursement" ? " *" : ""}
                </label>
                <input
                  id="te-ref"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder={
                    entryType === "receipt" || entryType === "disbursement"
                      ? "Cheque no. or leave blank for TR-0001"
                      : "Optional"
                  }
                  required={entryType === "receipt" || entryType === "disbursement" ? false : false}
                />
                {entryType === "receipt" || entryType === "disbursement" ? (
                  <p className="muted" style={{ fontSize: "0.72rem", margin: "0.25rem 0 0" }}>
                    Leave blank to auto allocate TR-0001 style reference. GL mirrors to 1210/2100.
                  </p>
                ) : null}
              </div>
              <div className="form-group">
                <label htmlFor="te-narr">Narrative</label>
                <textarea
                  id="te-narr"
                  rows={2}
                  value={narrative}
                  onChange={(e) => setNarrative(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={allowNegative}
                    onChange={(e) => setAllowNegative(e.target.checked)}
                  />
                  Allow negative client balance (Managing Partner, audited override)
                </label>
                {allowNegative ? (
                  <input
                    aria-label="Reason for overdrawing the client ledger"
                    placeholder="Reason for overdrawing (required)"
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    style={{ marginTop: "0.35rem" }}
                  />
                ) : null}
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <Button type="submit" size="sm" disabled={saving || !activeAccounts.length}>
                  {saving ? "Posting…" : "Post"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setPostOpen(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : null}

          {tab === "vault" ? (
            <TrustVaultPanel clients={clients} matters={matters} onRefresh={() => load()} />
          ) : null}

          {tab === "overview" && overview ? (
            <>
              <div className="panel" style={{ padding: "1rem", marginBottom: "1rem" }}>
                <h4 style={{ marginTop: 0 }}>Open trust for client</h4>
                <p className="muted" style={{ fontSize: "0.8rem", marginTop: 0 }}>
                  Search by client name or CL number, then record a trust receipt or disbursement.
                </p>
                <div className="grid-2">
                  <div className="form-group">
                    <label htmlFor="open-trust-search">Search client</label>
                    <input
                      id="open-trust-search"
                      value={openTrustSearch}
                      onChange={(e) => setOpenTrustSearch(e.target.value)}
                      placeholder="CL0001 or client name"
                    />
                    {openTrustSearch.trim() ? (
                      <div className="panel" style={{ marginTop: "0.35rem", padding: "0.35rem" }}>
                        {clientSearchResults.slice(0, 8).map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              className="btn btn-ghost btn-sm"
                              style={{ display: "block", width: "100%", textAlign: "left" }}
                              onClick={() => {
                                setOpenTrustClientId(c.id);
                                setOpenTrustSearch(clientLabel(c));
                              }}
                            >
                              {clientLabel(c)}
                            </button>
                          ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="form-group" style={{ alignSelf: "end" }}>
                    <Can permission="trust.manage">
                      <Button
                        size="sm"
                        disabled={!openTrustClientId}
                        onClick={() => startTrustForClient(openTrustClientId)}
                      >
                        Record trust movement
                      </Button>
                    </Can>
                  </div>
                </div>
              </div>

              <div className="trust-overview-cards">
                {bankAccounts.map((account) => (
                  <div key={account.id} className="trust-overview-card panel">
                    <div className="trust-overview-card-label">Master trust bank</div>
                    <div className="trust-overview-card-name">{account.name}</div>
                    <div className="trust-overview-card-balance">
                      {centsToDisplay(account.balanceCents, account.currency)}
                    </div>
                    {account.accountRef ? (
                      <div className="muted" style={{ fontSize: "0.75rem" }}>
                        {account.accountRef}
                      </div>
                    ) : null}
                  </div>
                ))}
                {vaultAccounts.map((account) => (
                  <div key={account.id} className="trust-overview-card panel">
                    <div className="trust-overview-card-label">Trust vault (cash)</div>
                    <div className="trust-overview-card-name">{account.name}</div>
                    <div className="trust-overview-card-balance">
                      {centsToDisplay(account.balanceCents, account.currency)}
                    </div>
                  </div>
                ))}
                {overview.clientTotalsByCurrency.map((total) => (
                  <div key={total.currency} className="trust-overview-card panel">
                    <div className="trust-overview-card-label">Sum of client balances</div>
                    <div className="trust-overview-card-balance">
                      {centsToDisplay(total.totalBalanceCents, total.currency)}
                    </div>
                    <div className="muted" style={{ fontSize: "0.75rem" }}>
                      {total.clientCount} client{total.clientCount === 1 ? "" : "s"} with balance
                    </div>
                  </div>
                ))}
              </div>

              <h4>Client trust balances</h4>
              {!overview.clientBalances.length ? (
                <EmptyState
                  title="No client trust balances"
                  detail="Post a trust receipt when client money is received."
                />
              ) : (
                <div className="table-wrap">
                  <table className="data data-dense">
                    <thead>
                      <tr>
                        <SortableTh
                          label="Client"
                          columnKey="client"
                          activeKey={balKey}
                          direction={balDir}
                          onSort={toggleBal}
                        />
                        <SortableTh
                          label="Balance"
                          columnKey="balance"
                          activeKey={balKey}
                          direction={balDir}
                          onSort={toggleBal}
                        />
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {sortedBalances.map((row) => (
                        <tr key={`${row.clientId}-${row.currency}`}>
                          <td>
                            <Link href={`/clients/${row.clientId}`}>{row.clientName}</Link>
                          </td>
                          <td className="finance-balance-outstanding">
                            {centsToDisplay(row.balanceCents, row.currency)}
                          </td>
                          <td>
                            <div style={{ display: "flex", gap: "0.35rem" }}>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openClientLedger(row.clientId)}
                              >
                                Ledger
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openClientStatement(row.clientId)}
                              >
                                Statement
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : null}

          {tab === "accounts" ? (
            !accounts.length ? (
              <EmptyState
                title="No trust accounts"
                detail="Create a trust bank/book account to start the ledger."
              />
            ) : (
              <table className="data data-dense">
                <thead>
                  <tr>
                    <SortableTh
                      label="Name"
                      columnKey="name"
                      activeKey={acctKey}
                      direction={acctDir}
                      onSort={toggleAcct}
                    />
                    <SortableTh
                      label="Type"
                      columnKey="type"
                      activeKey={acctKey}
                      direction={acctDir}
                      onSort={toggleAcct}
                    />
                    <SortableTh
                      label="Reference"
                      columnKey="reference"
                      activeKey={acctKey}
                      direction={acctDir}
                      onSort={toggleAcct}
                    />
                    <SortableTh
                      label="Balance"
                      columnKey="balance"
                      activeKey={acctKey}
                      direction={acctDir}
                      onSort={toggleAcct}
                    />
                    <SortableTh
                      label="Status"
                      columnKey="status"
                      activeKey={acctKey}
                      direction={acctDir}
                      onSort={toggleAcct}
                    />
                  </tr>
                </thead>
                <tbody>
                  {sortedAccounts.map((a) => (
                    <tr key={a.id}>
                      <td>{a.name}</td>
                      <td>{accountKindLabel(a.accountKind ?? "bank")}</td>
                      <td>{a.accountRef ?? "n/a"}</td>
                      <td>{centsToDisplay(a.balanceCents, a.currency)}</td>
                      <td>
                        <Badge tone={a.isActive ? "open" : "closed"}>
                          {a.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : null}

          {tab === "ledger" ? (
            <>
              <div className="toolbar" style={{ marginBottom: "0.75rem" }}>
                <select
                  className="filter-select"
                  value={accountFilter}
                  onChange={(e) => setAccountFilter(e.target.value)}
                >
                  <option value="">All accounts</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <select
                  className="filter-select"
                  value={clientFilter}
                  onChange={(e) => setClientFilter(e.target.value)}
                  style={{ minWidth: "160px" }}
                >
                  <option value="">All clients</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.displayLabel}
                    </option>
                  ))}
                </select>
              </div>
              {ledgerShowsRunning ? (
                <p className="muted" style={{ fontSize: "0.8rem", marginBottom: "0.75rem" }}>
                  Per-client ledger with continuous running balance (chronological).
                </p>
              ) : null}
              {!ledgerRows.length ? (
                <EmptyState
                  title="No ledger entries"
                  detail="Post a receipt when client money is received into trust."
                />
              ) : (
                <div className="table-wrap">
                  <table className="data data-dense">
                    <thead>
                      <tr>
                        <SortableTh
                          label="When"
                          columnKey="when"
                          activeKey={ledKey}
                          direction={ledDir}
                          onSort={toggleLed}
                        />
                        <SortableTh
                          label="Type"
                          columnKey="type"
                          activeKey={ledKey}
                          direction={ledDir}
                          onSort={toggleLed}
                        />
                        {!clientFilter ? (
                          <SortableTh
                            label="Client"
                            columnKey="client"
                            activeKey={ledKey}
                            direction={ledDir}
                            onSort={toggleLed}
                          />
                        ) : null}
                        <SortableTh
                          label="Account"
                          columnKey="account"
                          activeKey={ledKey}
                          direction={ledDir}
                          onSort={toggleLed}
                        />
                        <SortableTh
                          label="Amount"
                          columnKey="amount"
                          activeKey={ledKey}
                          direction={ledDir}
                          onSort={toggleLed}
                        />
                        {ledgerShowsRunning ? (
                          <SortableTh
                            label="Running"
                            columnKey="running"
                            activeKey={ledKey}
                            direction={ledDir}
                            onSort={toggleLed}
                          />
                        ) : null}
                        <SortableTh
                          label="Detail"
                          columnKey="detail"
                          activeKey={ledKey}
                          direction={ledDir}
                          onSort={toggleLed}
                        />
                        <th aria-label="Actions" />
                      </tr>
                    </thead>
                    <tbody>
                      {sortedLedger.map((row) => (
                        <tr key={row.id}>
                          <td>{new Date(row.occurredAt).toLocaleDateString()}</td>
                          <td>{row.entryType}</td>
                          {!clientFilter ? (
                            <td>
                              {row.clientId ? (
                                <Link href={`/clients/${row.clientId}`}>
                                  {row.clientDisplayName ?? "n/a"}
                                </Link>
                              ) : (
                                row.clientDisplayName ?? "n/a"
                              )}
                            </td>
                          ) : null}
                          <td>{row.accountName}</td>
                          <td
                            style={{
                              color: row.amountCents < 0 ? "var(--danger)" : undefined,
                              fontWeight: 600,
                            }}
                          >
                            {centsToDisplay(row.amountCents, row.currency)}
                          </td>
                          {ledgerShowsRunning ? (
                            <td>
                              {centsToDisplay(row.runningBalanceCents ?? 0, row.currency)}
                            </td>
                          ) : null}
                          <td>
                            <div>{row.narrative ?? row.reference ?? ""}</div>
                            {row.matterTitle ? (
                              <div className="muted" style={{ fontSize: "0.72rem" }}>
                                {row.matterTitle}
                              </div>
                            ) : null}
                            {row.reversalOfId ? (
                              <div className="muted" style={{ fontSize: "0.72rem" }}>
                                Reversal{row.reversalReason ? `: ${row.reversalReason}` : ""}
                              </div>
                            ) : null}
                          </td>
                          <td style={{ whiteSpace: "nowrap" }}>
                            <LedgerRowAction row={row} onDone={() => load()} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : null}

          {tab === "statement" ? (
            <div>
              <TrustMoneyCallout variant="statement" />
              <div className="toolbar" style={{ marginBottom: "0.75rem" }}>
                <select
                  className="filter-select"
                  value={statementClientId}
                  onChange={(e) => setStatementClientId(e.target.value)}
                  style={{ minWidth: "200px" }}
                >
                  <option value="">Select client</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.displayLabel}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  onClick={() => void loadStatement()}
                  disabled={!statementClientId || saving}
                >
                  Load statement
                </Button>
                {statement ? (
                  <>
                    <ExportMenu
                      kind="trust_statement"
                      queryParams={{ clientId: statementClientId }}
                      formats={["pdf", "docx", "xlsx"]}
                      disabled={!statementClientId}
                    />
                    <Button size="sm" variant="outline" onClick={() => window.print()}>
                      Print
                    </Button>
                  </>
                ) : null}
              </div>
              {statement ? (
                <div className="invoice-sheet trust-statement-sheet">
                  <h4 style={{ marginTop: 0 }}>Trust statement: {statement.clientName}</h4>
                  <p>
                    <strong>Closing balance:</strong>{" "}
                    {centsToDisplay(statement.balanceCents, statement.currency)}
                  </p>
                  <table className="data data-dense">
                    <thead>
                      <tr>
                        <SortableTh
                          label="When"
                          columnKey="when"
                          activeKey={stmtKey}
                          direction={stmtDir}
                          onSort={toggleStmt}
                        />
                        <SortableTh
                          label="Type"
                          columnKey="type"
                          activeKey={stmtKey}
                          direction={stmtDir}
                          onSort={toggleStmt}
                        />
                        <SortableTh
                          label="Amount"
                          columnKey="amount"
                          activeKey={stmtKey}
                          direction={stmtDir}
                          onSort={toggleStmt}
                        />
                        <SortableTh
                          label="Running"
                          columnKey="running"
                          activeKey={stmtKey}
                          direction={stmtDir}
                          onSort={toggleStmt}
                        />
                        <SortableTh
                          label="Detail"
                          columnKey="detail"
                          activeKey={stmtKey}
                          direction={stmtDir}
                          onSort={toggleStmt}
                        />
                      </tr>
                    </thead>
                    <tbody>
                      {sortedStatement.map((row) => (
                        <tr key={row.id}>
                          <td>{new Date(row.occurredAt).toLocaleDateString()}</td>
                          <td>{row.entryType}</td>
                          <td>{centsToDisplay(row.amountCents, row.currency)}</td>
                          <td>
                            {centsToDisplay(row.runningBalanceCents ?? 0, row.currency)}
                          </td>
                          <td>
                            {row.accountName}
                            {row.narrative ? ` · ${row.narrative}` : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="muted" style={{ fontSize: "0.75rem" }}>
                    Trust only. Fee invoices and fee payments are not included.
                  </p>
                </div>
              ) : (
                <EmptyState
                  title="Client trust statement"
                  detail="Select a client to see receipts, disbursements, and running balance."
                />
              )}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
