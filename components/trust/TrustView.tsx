"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Can } from "@/components/auth/Can";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { centsToDisplay } from "@/lib/billing/money";
import { TRUST_ENTRY_TYPES, type TrustEntryType } from "@/lib/trust/validation";

type Account = {
  id: string;
  name: string;
  currency: string;
  accountRef: string | null;
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
};

type ClientOption = { id: string; displayName: string };
type MatterOption = { id: string; title: string; matterNumber: string | null };

type Tab = "ledger" | "accounts" | "statement";

function todayInput() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function TrustView() {
  const [tab, setTab] = useState<Tab>("ledger");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [ledger, setLedger] = useState<LedgerItem[]>([]);
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
  const [adjustmentCredit, setAdjustmentCredit] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [newAccountOpen, setNewAccountOpen] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [accountRef, setAccountRef] = useState("");

  const [statementClientId, setStatementClientId] = useState("");
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await loadAccounts();
      await loadLedger();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load trust.");
    } finally {
      setLoading(false);
    }
  }, [loadAccounts, loadLedger]);

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
            data?: { items?: Array<{ id: string; displayName: string }> };
          };
          if (!cancelled) {
            setClients(
              (cBody.data?.items ?? []).map((c) => ({
                id: c.id,
                displayName: c.displayName,
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

  async function createAccount(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch("/api/trust/accounts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: accountName, accountRef: accountRef || null }),
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

  const activeAccounts = accounts.filter((a) => a.isActive);

  return (
    <section className="view active scrollable" aria-label="Trust">
      <div className="panel">
        <div className="panel-head">
          <h3>Trust ledger</h3>
          <Can permission="trust.manage">
            <div style={{ display: "flex", gap: "0.35rem" }}>
              <Button size="sm" variant="outline" onClick={() => setNewAccountOpen(true)}>
                New account
              </Button>
              <Button size="sm" onClick={() => setPostOpen(true)}>
                Post entry
              </Button>
            </div>
          </Can>
        </div>
        <div className="panel-body">
          <p className="muted" style={{ marginTop: 0, fontSize: "0.8rem" }}>
            Client money held in trust. Separate from fee notes and fee payments. Negative client
            balances are blocked by default (override is audited).
          </p>

          <div className="toolbar" style={{ marginBottom: "0.75rem" }}>
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
                  <select
                    id="te-client"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    required={entryType !== "transfer"}
                  >
                    <option value="">Select client</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.displayName}
                      </option>
                    ))}
                  </select>
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
                <label htmlFor="te-ref">Reference</label>
                <input
                  id="te-ref"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
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
                  Allow negative client balance (audited override)
                </label>
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

          {tab === "accounts" ? (
            !accounts.length ? (
              <EmptyState
                title="No trust accounts"
                detail="Create a trust bank/book account to start the ledger."
              />
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Reference</th>
                    <th>Balance</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((a) => (
                    <tr key={a.id}>
                      <td>{a.name}</td>
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
                      {c.displayName}
                    </option>
                  ))}
                </select>
              </div>
              {!ledger.length ? (
                <EmptyState
                  title="No ledger entries"
                  detail="Post a receipt when client money is received into trust."
                />
              ) : (
                <table className="data">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Type</th>
                      <th>Client</th>
                      <th>Account</th>
                      <th>Amount</th>
                      <th>Narrative</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.map((row) => (
                      <tr key={row.id}>
                        <td>{new Date(row.occurredAt).toLocaleDateString()}</td>
                        <td>{row.entryType}</td>
                        <td>{row.clientDisplayName ?? "n/a"}</td>
                        <td>{row.accountName}</td>
                        <td
                          style={{
                            color: row.amountCents < 0 ? "var(--danger)" : undefined,
                            fontWeight: 600,
                          }}
                        >
                          {centsToDisplay(row.amountCents, row.currency)}
                        </td>
                        <td>
                          <div>{row.narrative ?? row.reference ?? ""}</div>
                          {row.matterTitle ? (
                            <div className="muted" style={{ fontSize: "0.72rem" }}>
                              {row.matterTitle}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          ) : null}

          {tab === "statement" ? (
            <div>
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
                      {c.displayName}
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
                  <Button size="sm" variant="outline" onClick={() => window.print()}>
                    Print
                  </Button>
                ) : null}
              </div>
              {statement ? (
                <div className="invoice-sheet">
                  <h4 style={{ marginTop: 0 }}>Trust statement: {statement.clientName}</h4>
                  <p>
                    <strong>Balance:</strong>{" "}
                    {centsToDisplay(statement.balanceCents, statement.currency)}
                  </p>
                  <table className="data">
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Type</th>
                        <th>Amount</th>
                        <th>Running</th>
                        <th>Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statement.lines.map((row) => (
                        <tr key={row.id}>
                          <td>{new Date(row.occurredAt).toLocaleDateString()}</td>
                          <td>{row.entryType}</td>
                          <td>{centsToDisplay(row.amountCents, row.currency)}</td>
                          <td>
                            {centsToDisplay(
                              row.runningBalanceCents ?? 0,
                              row.currency,
                            )}
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
                  detail="Select a client to see receipts, payments, and running balance."
                />
              )}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
