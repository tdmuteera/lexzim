"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { Can } from "@/components/auth/Can";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SortableTh } from "@/components/ui/SortableTh";
import { centsToDisplay } from "@/lib/billing/money";
import { useTableSort } from "@/lib/ui/table-sort";

type ClientOption = { id: string; displayLabel: string; displayName?: string };
type MatterOption = { id: string; title: string; matterNumber: string | null };

type ClientPortion = {
  clientId: string;
  clientName: string;
  currency: string;
  balanceCents: number;
};

type BankIn = {
  id: string;
  amountCents: number;
  currency: string;
  occurredAt: string;
  clientName: string | null;
  bankName: string;
};

type VaultCount = {
  id: string;
  countedAt: string;
  systemBalanceCents: number;
  countedBalanceCents: number;
  varianceCents: number;
  notes: string | null;
};

type VaultData = {
  vaultAccounts: Array<{ id: string; name: string; currency: string; isActive: boolean }>;
  bankAccounts: Array<{ id: string; name: string; currency: string }>;
  vault: {
    id: string;
    name: string;
    currency: string;
    balanceCents: number;
    clientPortions: ClientPortion[];
    clientPortionsTotalCents: number;
    recentBankIns: BankIn[];
    recentCounts: VaultCount[];
  } | null;
};

function todayInput() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

type TrustVaultPanelProps = {
  clients: ClientOption[];
  matters: MatterOption[];
  onRefresh: () => void;
};

export function TrustVaultPanel({ clients, matters, onRefresh }: TrustVaultPanelProps) {
  const [data, setData] = useState<VaultData | null>(null);
  const [vaultAccountId, setVaultAccountId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [cashOpen, setCashOpen] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const [countOpen, setCountOpen] = useState(false);

  const [cashClientId, setCashClientId] = useState("");
  const [cashMatterId, setCashMatterId] = useState("");
  const [cashAmount, setCashAmount] = useState("");
  const [cashDate, setCashDate] = useState(todayInput);
  const [cashNarrative, setCashNarrative] = useState("");

  const [bankClientId, setBankClientId] = useState("");
  const [bankMatterId, setBankMatterId] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [bankAmount, setBankAmount] = useState("");
  const [bankDate, setBankDate] = useState(todayInput);
  const [bankReference, setBankReference] = useState("");
  const [bankAllowNegative, setBankAllowNegative] = useState(false);

  const [countDollars, setCountDollars] = useState("");
  const [countDate, setCountDate] = useState(todayInput);
  const [countNotes, setCountNotes] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (vaultAccountId) params.set("vaultAccountId", vaultAccountId);
      const res = await fetch(`/api/trust/vault?${params.toString()}`, {
        credentials: "include",
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: VaultData;
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Could not load vault.");
        setData(null);
        return;
      }
      setData(body.data);
      if (!vaultAccountId && body.data.vault) {
        setVaultAccountId(body.data.vault.id);
      }
      if (!bankAccountId && body.data.bankAccounts[0]) {
        setBankAccountId(body.data.bankAccounts[0].id);
      }
    } catch {
      setError("Could not load vault.");
    } finally {
      setLoading(false);
    }
  }, [vaultAccountId, bankAccountId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function receiveCash(e: FormEvent) {
    e.preventDefault();
    if (!data?.vault) return;
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch("/api/trust/ledger", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryType: "receipt",
          trustAccountId: data.vault.id,
          clientId: cashClientId,
          matterId: cashMatterId || null,
          amountDollars: cashAmount,
          occurredAt: new Date(`${cashDate}T12:00:00`).toISOString(),
          narrative: cashNarrative || "Cash trust receipt (vault)",
        }),
      });
      const body = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setFormError(body.error?.message ?? "Could not post cash receipt.");
        return;
      }
      setCashOpen(false);
      setCashAmount("");
      setCashNarrative("");
      await load();
      onRefresh();
    } catch {
      setFormError("Could not post cash receipt.");
    } finally {
      setSaving(false);
    }
  }

  async function bankVault(e: FormEvent) {
    e.preventDefault();
    if (!data?.vault) return;
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch("/api/trust/vault/bank-in", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vaultAccountId: data.vault.id,
          bankAccountId,
          clientId: bankClientId,
          matterId: bankMatterId || null,
          amountDollars: bankAmount,
          occurredAt: new Date(`${bankDate}T12:00:00`).toISOString(),
          reference: bankReference || null,
          allowNegative: bankAllowNegative,
        }),
      });
      const body = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setFormError(body.error?.message ?? "Could not bank vault cash.");
        return;
      }
      setBankOpen(false);
      setBankAmount("");
      setBankReference("");
      setBankAllowNegative(false);
      await load();
      onRefresh();
    } catch {
      setFormError("Could not bank vault cash.");
    } finally {
      setSaving(false);
    }
  }

  async function submitCount(e: FormEvent) {
    e.preventDefault();
    if (!data?.vault) return;
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch("/api/trust/vault/counts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vaultAccountId: data.vault.id,
          countedDollars: countDollars,
          countedAt: new Date(`${countDate}T12:00:00`).toISOString(),
          notes: countNotes || null,
        }),
      });
      const body = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setFormError(body.error?.message ?? "Could not save vault count.");
        return;
      }
      setCountOpen(false);
      setCountDollars("");
      setCountNotes("");
      await load();
    } catch {
      setFormError("Could not save vault count.");
    } finally {
      setSaving(false);
    }
  }

  const portions = data?.vault?.clientPortions ?? [];
  const bankIns = data?.vault?.recentBankIns ?? [];
  const counts = data?.vault?.recentCounts ?? [];

  const portionAccessors = useMemo(
    () => ({
      client: (r: ClientPortion) => r.clientName,
      balance: (r: ClientPortion) => r.balanceCents,
    }),
    [],
  );
  const {
    sortedRows: sortedPortions,
    sortKey: portionKey,
    sortDir: portionDir,
    toggleSort: togglePortion,
  } = useTableSort(portions, portionAccessors, { key: "client", dir: "asc" });

  const bankInAccessors = useMemo(
    () => ({
      when: (r: BankIn) => r.occurredAt,
      client: (r: BankIn) => r.clientName ?? "",
      bank: (r: BankIn) => r.bankName,
      amount: (r: BankIn) => r.amountCents,
    }),
    [],
  );
  const {
    sortedRows: sortedBankIns,
    sortKey: bankInKey,
    sortDir: bankInDir,
    toggleSort: toggleBankIn,
  } = useTableSort(bankIns, bankInAccessors, { key: "when", dir: "desc" });

  const countAccessors = useMemo(
    () => ({
      counted: (r: VaultCount) => r.countedAt,
      system: (r: VaultCount) => r.systemBalanceCents,
      countedAmt: (r: VaultCount) => r.countedBalanceCents,
      variance: (r: VaultCount) => r.varianceCents,
      notes: (r: VaultCount) => r.notes ?? "",
    }),
    [],
  );
  const {
    sortedRows: sortedCounts,
    sortKey: countKey,
    sortDir: countDir,
    toggleSort: toggleCount,
  } = useTableSort(counts, countAccessors, { key: "counted", dir: "desc" });

  if (loading && !data) {
    return <p className="muted">Loading vault…</p>;
  }

  if (!data?.vault) {
    return (
      <EmptyState
        title="No trust vault account"
        detail="Create a vault (cash) trust account under Accounts, then receive client cash into it."
      />
    );
  }

  const vault = data.vault;

  return (
    <div className="trust-vault-panel">
      <div className="trust-vault-warning panel" role="note">
        <strong>Client money in cash</strong>
        <p>
          Vault cash is client trust money held physically. It is not firm petty cash, fee
          revenue, or business operating cash (those belong in Expenses & cashbook).
        </p>
      </div>

      {error ? (
        <p role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem" }}>{error}</p>
      ) : null}

      <div className="trust-overview-cards" style={{ marginBottom: "1rem" }}>
        <div className="trust-overview-card panel">
          <div className="trust-overview-card-label">Vault system balance</div>
          <div className="trust-overview-card-balance">
            {centsToDisplay(vault.balanceCents, vault.currency)}
          </div>
          <div className="muted" style={{ fontSize: "0.75rem" }}>{vault.name}</div>
        </div>
        <div className="trust-overview-card panel">
          <div className="trust-overview-card-label">Sum of client portions</div>
          <div className="trust-overview-card-balance">
            {centsToDisplay(vault.clientPortionsTotalCents, vault.currency)}
          </div>
          <div className="muted" style={{ fontSize: "0.75rem" }}>
            {vault.clientPortions.length} client portion
            {vault.clientPortions.length === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      {data.vaultAccounts.length > 1 ? (
        <div className="form-group" style={{ marginBottom: "1rem" }}>
          <label htmlFor="vault-select">Vault account</label>
          <select
            id="vault-select"
            value={vaultAccountId}
            onChange={(e) => setVaultAccountId(e.target.value)}
          >
            {data.vaultAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} {a.isActive ? "" : "(inactive)"}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <Can permission="trust.manage">
        <div className="toolbar" style={{ marginBottom: "1rem" }}>
          <Button size="sm" onClick={() => setCashOpen(true)}>Receive cash</Button>
          <Button size="sm" variant="outline" onClick={() => setBankOpen(true)}>
            Bank vault
          </Button>
          <Button size="sm" variant="outline" onClick={() => setCountOpen(true)}>
            Vault count
          </Button>
        </div>
      </Can>

      {formError ? (
        <p role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem" }}>{formError}</p>
      ) : null}

      {cashOpen ? (
        <form onSubmit={receiveCash} className="panel" style={{ padding: "1rem", marginBottom: "1rem" }}>
          <h4 style={{ marginTop: 0 }}>Receive cash into vault</h4>
          <p className="muted" style={{ fontSize: "0.8rem", marginTop: 0 }}>
            Client-tagged cash receipt. Posts to vault trust ledger only.
          </p>
          <div className="grid-2">
            <div className="form-group">
              <label htmlFor="vc-client">Client</label>
              <select id="vc-client" value={cashClientId} onChange={(e) => setCashClientId(e.target.value)} required>
                <option value="">Select client</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.displayLabel ?? c.displayName}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="vc-matter">Matter (optional)</label>
              <select id="vc-matter" value={cashMatterId} onChange={(e) => setCashMatterId(e.target.value)}>
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
              <label htmlFor="vc-amt">Amount ({vault.currency})</label>
              <input id="vc-amt" type="number" min={0.01} step="0.01" value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} required />
            </div>
            <div className="form-group">
              <label htmlFor="vc-date">Received</label>
              <input id="vc-date" type="date" value={cashDate} onChange={(e) => setCashDate(e.target.value)} required />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="vc-narr">Narrative</label>
            <input id="vc-narr" value={cashNarrative} onChange={(e) => setCashNarrative(e.target.value)} placeholder="Cash trust receipt" />
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Button type="submit" size="sm" disabled={saving}>{saving ? "Posting…" : "Post receipt"}</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setCashOpen(false)}>Cancel</Button>
          </div>
        </form>
      ) : null}

      {bankOpen ? (
        <form onSubmit={bankVault} className="panel" style={{ padding: "1rem", marginBottom: "1rem" }}>
          <h4 style={{ marginTop: 0 }}>Bank vault → master trust bank</h4>
          <p className="muted" style={{ fontSize: "0.8rem", marginTop: 0 }}>
            Moves location of client trust money from vault to bank. Client ledger total stays correct.
          </p>
          <div className="grid-2">
            <div className="form-group">
              <label htmlFor="vb-client">Client</label>
              <select id="vb-client" value={bankClientId} onChange={(e) => setBankClientId(e.target.value)} required>
                <option value="">Select client</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.displayLabel ?? c.displayName}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="vb-bank">Destination bank</label>
              <select id="vb-bank" value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)} required>
                {data.bankAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label htmlFor="vb-amt">Amount ({vault.currency})</label>
              <input id="vb-amt" type="number" min={0.01} step="0.01" value={bankAmount} onChange={(e) => setBankAmount(e.target.value)} required />
            </div>
            <div className="form-group">
              <label htmlFor="vb-date">Banked on</label>
              <input id="vb-date" type="date" value={bankDate} onChange={(e) => setBankDate(e.target.value)} required />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="vb-ref">Reference</label>
            <input id="vb-ref" value={bankReference} onChange={(e) => setBankReference(e.target.value)} placeholder="Deposit slip ref" />
          </div>
          <div className="form-group">
            <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <input type="checkbox" checked={bankAllowNegative} onChange={(e) => setBankAllowNegative(e.target.checked)} />
              Allow negative vault balance (audited override)
            </label>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Button type="submit" size="sm" disabled={saving}>{saving ? "Banking…" : "Bank vault cash"}</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setBankOpen(false)}>Cancel</Button>
          </div>
        </form>
      ) : null}

      {countOpen ? (
        <form onSubmit={submitCount} className="panel" style={{ padding: "1rem", marginBottom: "1rem" }}>
          <h4 style={{ marginTop: 0 }}>Vault count worksheet</h4>
          <p className="muted" style={{ fontSize: "0.8rem", marginTop: 0 }}>
            System balance at save: {centsToDisplay(vault.balanceCents, vault.currency)}
          </p>
          <div className="grid-2">
            <div className="form-group">
              <label htmlFor="vct-amt">Counted cash ({vault.currency})</label>
              <input id="vct-amt" type="number" min={0} step="0.01" value={countDollars} onChange={(e) => setCountDollars(e.target.value)} required />
            </div>
            <div className="form-group">
              <label htmlFor="vct-date">Counted on</label>
              <input id="vct-date" type="date" value={countDate} onChange={(e) => setCountDate(e.target.value)} required />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="vct-notes">Variance notes</label>
            <textarea id="vct-notes" rows={2} value={countNotes} onChange={(e) => setCountNotes(e.target.value)} placeholder="Explain variance if any" />
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Button type="submit" size="sm" disabled={saving}>{saving ? "Saving…" : "Save count"}</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setCountOpen(false)}>Cancel</Button>
          </div>
        </form>
      ) : null}

      <h4>Client portions in vault</h4>
      {!vault.clientPortions.length ? (
        <p className="muted" style={{ fontSize: "0.85rem" }}>No client cash portions in vault.</p>
      ) : (
        <table className="data data-dense" style={{ marginBottom: "1.25rem" }}>
          <thead>
            <tr>
              <SortableTh label="Client" columnKey="client" activeKey={portionKey} direction={portionDir} onSort={togglePortion} />
              <SortableTh label="Balance in vault" columnKey="balance" activeKey={portionKey} direction={portionDir} onSort={togglePortion} />
            </tr>
          </thead>
          <tbody>
            {sortedPortions.map((row) => (
              <tr key={`${row.clientId}-${row.currency}`}>
                <td>
                  <Link href={`/clients/${row.clientId}`}>{row.clientName}</Link>
                </td>
                <td>{centsToDisplay(row.balanceCents, row.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {vault.recentBankIns.length ? (
        <>
          <h4>Recent vault bank-ins</h4>
          <table className="data data-dense" style={{ marginBottom: "1.25rem" }}>
            <thead>
              <tr>
                <SortableTh label="When" columnKey="when" activeKey={bankInKey} direction={bankInDir} onSort={toggleBankIn} />
                <SortableTh label="Client" columnKey="client" activeKey={bankInKey} direction={bankInDir} onSort={toggleBankIn} />
                <SortableTh label="Bank" columnKey="bank" activeKey={bankInKey} direction={bankInDir} onSort={toggleBankIn} />
                <SortableTh label="Amount" columnKey="amount" activeKey={bankInKey} direction={bankInDir} onSort={toggleBankIn} />
              </tr>
            </thead>
            <tbody>
              {sortedBankIns.map((row) => (
                <tr key={row.id}>
                  <td>{new Date(row.occurredAt).toLocaleDateString()}</td>
                  <td>{row.clientName ?? "n/a"}</td>
                  <td>{row.bankName}</td>
                  <td>{centsToDisplay(row.amountCents, row.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}

      {vault.recentCounts.length ? (
        <>
          <h4>Vault count history</h4>
          <table className="data data-dense">
            <thead>
              <tr>
                <SortableTh label="Counted" columnKey="counted" activeKey={countKey} direction={countDir} onSort={toggleCount} />
                <SortableTh label="System" columnKey="system" activeKey={countKey} direction={countDir} onSort={toggleCount} />
                <SortableTh label="Counted" columnKey="countedAmt" activeKey={countKey} direction={countDir} onSort={toggleCount} />
                <SortableTh label="Variance" columnKey="variance" activeKey={countKey} direction={countDir} onSort={toggleCount} />
                <SortableTh label="Notes" columnKey="notes" activeKey={countKey} direction={countDir} onSort={toggleCount} />
              </tr>
            </thead>
            <tbody>
              {sortedCounts.map((row) => (
                <tr key={row.id}>
                  <td>{new Date(row.countedAt).toLocaleDateString()}</td>
                  <td>{centsToDisplay(row.systemBalanceCents, vault.currency)}</td>
                  <td>{centsToDisplay(row.countedBalanceCents, vault.currency)}</td>
                  <td className={row.varianceCents !== 0 ? "finance-ageing-hint" : ""}>
                    {centsToDisplay(row.varianceCents, vault.currency)}
                  </td>
                  <td>{row.notes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
    </div>
  );
}
