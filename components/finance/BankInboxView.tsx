"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { centsToDisplay } from "@/lib/billing/money";
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS } from "@/lib/finance/expense-categories";

type ImportRow = {
  id: string;
  accountKind: string;
  bankAccountLabel: string | null;
  trustAccountId: string | null;
  currency: string;
  sourceFilename: string | null;
  status: string;
  lineCount: number;
  createdAt: string;
};

type LineRow = {
  id: string;
  lineDate: string;
  description: string;
  reference: string | null;
  amountCents: number;
  status: string;
  suggestedCategory: string | null;
  suggestedPayee: string | null;
  matchedEntityType: string | null;
};

type Candidate = {
  entityType: string;
  entityId: string;
  label: string;
  amountCents: number;
  occurredAt: string;
};

type RuleRow = {
  id: string;
  name: string;
  direction: string;
  matchField: string;
  matchType: string;
  matchValue: string;
  priority: number;
  action: string;
  expenseCategory: string | null;
  defaultPayee: string | null;
  isActive: boolean;
};

type TrustAccount = { id: string; name: string; accountKind: string };

type Tab = "inbox" | "rules";

type ApiBody = {
  ok?: boolean;
  data?: Record<string, unknown>;
  error?: { message?: string };
};

async function readJson(res: Response) {
  const body = (await res.json().catch(() => ({}))) as ApiBody;
  return { status: res.status, body };
}

function errMsg(body: ApiBody, fallback: string) {
  return body.error?.message ?? fallback;
}

function money(cents: number, currency = "USD") {
  const sign = cents < 0 ? "−" : "";
  return `${sign}${centsToDisplay(Math.abs(cents), currency)}`;
}

export function BankInboxView() {
  const [tab, setTab] = useState<Tab>("inbox");
  const [imports, setImports] = useState<ImportRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lines, setLines] = useState<LineRow[]>([]);
  const [counts, setCounts] = useState({ pending: 0, matched: 0, ignored: 0, posted: 0 });
  const [trustAccounts, setTrustAccounts] = useState<TrustAccount[]>([]);
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lineFilter, setLineFilter] = useState<"pending" | "all">("pending");

  const [accountKind, setAccountKind] = useState<"business_bank" | "trust_bank">("business_bank");
  const [bankLabel, setBankLabel] = useState("Operating bank");
  const [trustAccountId, setTrustAccountId] = useState("");
  const [csvText, setCsvText] = useState("");
  const [filename, setFilename] = useState("");

  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [postCategory, setPostCategory] = useState<string>("other");
  const [postPayee, setPostPayee] = useState("");

  const [ruleName, setRuleName] = useState("");
  const [ruleValue, setRuleValue] = useState("");
  const [ruleAction, setRuleAction] = useState("suggest_expense");
  const [ruleCategory, setRuleCategory] = useState("other");
  const [rulePayee, setRulePayee] = useState("");
  const [ruleDirection, setRuleDirection] = useState("out");

  const loadImports = useCallback(async () => {
    const res = await fetch("/api/finance/bank-inbox");
    const { body } = await readJson(res);
    if (!res.ok || !body.ok || !body.data) {
      setError(errMsg(body, "Could not load imports."));
      return;
    }
    setImports((body.data.items as ImportRow[]) ?? []);
  }, []);

  const loadRules = useCallback(async () => {
    const res = await fetch("/api/finance/bank-inbox/rules");
    const { body } = await readJson(res);
    if (!res.ok || !body.ok || !body.data) return;
    setRules((body.data.items as RuleRow[]) ?? []);
  }, []);

  const loadTrust = useCallback(async () => {
    const res = await fetch("/api/trust/accounts?active=all");
    const { body } = await readJson(res);
    if (!res.ok || !body.ok || !body.data) return;
    const items = ((body.data.items as TrustAccount[]) ?? []).filter(
      (a) => a.accountKind === "bank",
    );
    setTrustAccounts(items);
    if (!trustAccountId && items[0]) setTrustAccountId(items[0].id);
  }, [trustAccountId]);

  const loadImportDetail = useCallback(async (id: string) => {
    const q = lineFilter === "pending" ? "?status=pending" : "";
    const res = await fetch(`/api/finance/bank-inbox/${id}${q}`);
    const { body } = await readJson(res);
    if (!res.ok || !body.ok || !body.data) {
      setError(errMsg(body, "Could not load import."));
      return;
    }
    setLines((body.data.lines as LineRow[]) ?? []);
    setCounts(
      (body.data.counts as {
        pending: number;
        matched: number;
        ignored: number;
        posted: number;
      }) ?? { pending: 0, matched: 0, ignored: 0, posted: 0 },
    );
  }, [lineFilter]);

  useEffect(() => {
    void loadImports();
    void loadRules();
    void loadTrust();
  }, [loadImports, loadRules, loadTrust]);

  useEffect(() => {
    if (selectedId) void loadImportDetail(selectedId);
  }, [selectedId, loadImportDetail]);

  async function onUpload(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/finance/bank-inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountKind,
          bankAccountLabel: accountKind === "business_bank" ? bankLabel : null,
          trustAccountId: accountKind === "trust_bank" ? trustAccountId : null,
          csvText,
          sourceFilename: filename || null,
        }),
      });
      const { body } = await readJson(res);
      if (!res.ok || !body.ok || !body.data) {
        setError(errMsg(body, "Import failed."));
        return;
      }
      setCsvText("");
      setFilename("");
      await loadImports();
      const id = (body.data.import as ImportRow | undefined)?.id;
      if (id) setSelectedId(id);
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File | null) {
    if (!file) return;
    setFilename(file.name);
    setCsvText(await file.text());
  }

  async function openLine(line: LineRow) {
    setActiveLineId(line.id);
    setPostCategory(line.suggestedCategory ?? "other");
    setPostPayee(line.suggestedPayee ?? line.description.slice(0, 80));
    const res = await fetch(`/api/finance/bank-inbox/lines/${line.id}`);
    const { body } = await readJson(res);
    if (res.ok && body.ok && body.data) {
      setCandidates((body.data.candidates as Candidate[]) ?? []);
    } else {
      setCandidates([]);
    }
  }

  async function lineAction(lineId: string, payload: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/finance/bank-inbox/lines/${lineId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const { body } = await readJson(res);
      if (!res.ok || !body.ok) {
        setError(errMsg(body, "Action failed."));
        return;
      }
      setActiveLineId(null);
      if (selectedId) await loadImportDetail(selectedId);
      await loadImports();
    } finally {
      setBusy(false);
    }
  }

  async function closeImport() {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/finance/bank-inbox/${selectedId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "close" }),
      });
      const { body } = await readJson(res);
      if (!res.ok || !body.ok) {
        setError(errMsg(body, "Could not close import."));
        return;
      }
      await loadImports();
      await loadImportDetail(selectedId);
    } finally {
      setBusy(false);
    }
  }

  async function createRule(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/finance/bank-inbox/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: ruleName,
          direction: ruleDirection,
          matchField: "description",
          matchType: "contains",
          matchValue: ruleValue,
          priority: 100,
          action: ruleAction,
          expenseCategory: ruleAction === "suggest_expense" ? ruleCategory : null,
          defaultPayee: rulePayee || null,
          isActive: true,
        }),
      });
      const { body } = await readJson(res);
      if (!res.ok || !body.ok) {
        setError(errMsg(body, "Could not create rule."));
        return;
      }
      setRuleName("");
      setRuleValue("");
      setRulePayee("");
      await loadRules();
    } finally {
      setBusy(false);
    }
  }

  async function deleteRule(id: string) {
    setBusy(true);
    try {
      await fetch(`/api/finance/bank-inbox/rules/${id}`, { method: "DELETE" });
      await loadRules();
    } finally {
      setBusy(false);
    }
  }

  const selected = imports.find((i) => i.id === selectedId) ?? null;

  return (
    <div className="stack gap-lg">
      <div className="row gap-sm wrap">
        <Button
          type="button"
          variant={tab === "inbox" ? "primary" : "ghost"}
          onClick={() => setTab("inbox")}
        >
          Statement inbox
        </Button>
        <Button
          type="button"
          variant={tab === "rules" ? "primary" : "ghost"}
          onClick={() => setTab("rules")}
        >
          Match rules
        </Button>
        <Link href="/finance/reconciliations" className="muted">
          Period reconciliations →
        </Link>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      {tab === "rules" ? (
        <div className="stack gap-md">
          <form className="stack gap-sm panel" onSubmit={createRule}>
            <h2 className="h3">New rule</h2>
            <p className="muted">
              When a CSV line matches, suggest a category or auto-ignore. Trust imports never
              auto-post client money from a rule.
            </p>
            <label>
              Name
              <input value={ruleName} onChange={(e) => setRuleName(e.target.value)} required />
            </label>
            <label>
              Description contains
              <input value={ruleValue} onChange={(e) => setRuleValue(e.target.value)} required />
            </label>
            <label>
              Direction
              <select value={ruleDirection} onChange={(e) => setRuleDirection(e.target.value)}>
                <option value="out">Money out</option>
                <option value="in">Money in</option>
                <option value="any">Any</option>
              </select>
            </label>
            <label>
              Action
              <select value={ruleAction} onChange={(e) => setRuleAction(e.target.value)}>
                <option value="suggest_expense">Suggest expense category</option>
                <option value="suggest_cashbook_in">Suggest cashbook in</option>
                <option value="ignore">Ignore matching lines</option>
              </select>
            </label>
            {ruleAction === "suggest_expense" ? (
              <label>
                Category
                <select value={ruleCategory} onChange={(e) => setRuleCategory(e.target.value)}>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {EXPENSE_CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label>
              Default payee
              <input value={rulePayee} onChange={(e) => setRulePayee(e.target.value)} />
            </label>
            <Button type="submit" disabled={busy}>
              Save rule
            </Button>
          </form>

          {rules.length === 0 ? (
            <EmptyState title="No rules yet" detail="Add a rule to speed up bank categorization." />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Match</th>
                  <th>Action</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {r.name}{" "}
                      {!r.isActive ? <Badge tone="closed">Off</Badge> : null}
                    </td>
                    <td className="muted">
                      {r.direction} · {r.matchField} {r.matchType} “{r.matchValue}”
                    </td>
                    <td>
                      {r.action}
                      {r.expenseCategory ? ` · ${r.expenseCategory}` : ""}
                    </td>
                    <td>
                      <Button type="button" variant="ghost" onClick={() => void deleteRule(r.id)}>
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="stack gap-lg">
          <form className="stack gap-sm panel" onSubmit={onUpload}>
            <h2 className="h3">Import statement CSV</h2>
            <p className="muted">
              Upload a bank CSV (Date + Amount, or Debit/Credit). Match lines to the cash book or
              trust ledger, or post business expenses. No live bank feed.
            </p>
            <label>
              Account
              <select
                value={accountKind}
                onChange={(e) =>
                  setAccountKind(e.target.value as "business_bank" | "trust_bank")
                }
              >
                <option value="business_bank">Business operating bank</option>
                <option value="trust_bank">Trust bank</option>
              </select>
            </label>
            {accountKind === "business_bank" ? (
              <label>
                Bank account label
                <input value={bankLabel} onChange={(e) => setBankLabel(e.target.value)} required />
              </label>
            ) : (
              <label>
                Trust bank account
                <select
                  value={trustAccountId}
                  onChange={(e) => setTrustAccountId(e.target.value)}
                  required
                >
                  {trustAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              CSV file
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <label>
              Or paste CSV
              <textarea
                rows={6}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder={"Date,Description,Amount\n2026-10-01,Office rent,-450.00"}
              />
            </label>
            <Button type="submit" disabled={busy || !csvText.trim()}>
              Import
            </Button>
          </form>

          <div className="row gap-lg wrap align-start">
            <div className="stack gap-sm" style={{ minWidth: 240, flex: 1 }}>
              <h2 className="h3">Imports</h2>
              {imports.length === 0 ? (
                <EmptyState title="No imports" detail="Upload a CSV to start matching." />
              ) : (
                <ul className="stack gap-xs">
                  {imports.map((imp) => (
                    <li key={imp.id}>
                      <button
                        type="button"
                        className={selectedId === imp.id ? "chip active" : "chip"}
                        onClick={() => setSelectedId(imp.id)}
                      >
                        {imp.sourceFilename || imp.accountKind} · {imp.lineCount} lines ·{" "}
                        {imp.status}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="stack gap-sm" style={{ flex: 3, minWidth: 320 }}>
              {!selected ? (
                <EmptyState title="Select an import" detail="Choose a batch on the left." />
              ) : (
                <>
                  <div className="row gap-sm wrap">
                    <Badge>{selected.accountKind}</Badge>
                    <Badge>
                      pending {counts.pending} · matched {counts.matched} · posted{" "}
                      {counts.posted} · ignored {counts.ignored}
                    </Badge>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() =>
                        setLineFilter((f) => (f === "pending" ? "all" : "pending"))
                      }
                    >
                      Show {lineFilter === "pending" ? "all" : "pending"}
                    </Button>
                    {selected.status === "open" ? (
                      <Button type="button" onClick={() => void closeImport()} disabled={busy}>
                        Close import
                      </Button>
                    ) : null}
                  </div>

                  {lines.length === 0 ? (
                    <EmptyState
                      title="No lines in this filter"
                      detail="Try showing all lines, or import another CSV."
                    />
                  ) : (
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Description</th>
                          <th>Amount</th>
                          <th>Status</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((line) => (
                          <tr key={line.id}>
                            <td>{line.lineDate.slice(0, 10)}</td>
                            <td>
                              {line.description}
                              {line.suggestedCategory ? (
                                <div className="muted">
                                  Suggested: {line.suggestedCategory}
                                  {line.suggestedPayee ? ` · ${line.suggestedPayee}` : ""}
                                </div>
                              ) : null}
                            </td>
                            <td>{money(line.amountCents, selected.currency)}</td>
                            <td>
                              <Badge tone={line.status === "pending" ? "pending" : "closed"}>
                                {line.status}
                              </Badge>
                            </td>
                            <td>
                              {line.status === "pending" ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  onClick={() => void openLine(line)}
                                >
                                  Review
                                </Button>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {activeLineId ? (
                    <div className="panel stack gap-sm">
                      <h3 className="h3">Review line</h3>
                      {candidates.length > 0 ? (
                        <div className="stack gap-xs">
                          <p className="muted">Suggested matches</p>
                          {candidates.map((c) => (
                            <div key={`${c.entityType}-${c.entityId}`} className="row gap-sm wrap">
                              <span>
                                {c.label} · {money(c.amountCents)} · {c.occurredAt.slice(0, 10)}
                              </span>
                              <Button
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  void lineAction(activeLineId, {
                                    action: "match",
                                    matchedEntityType: c.entityType,
                                    matchedEntityId: c.entityId,
                                  })
                                }
                              >
                                Match
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="muted">No automatic matches in the ±4 day window.</p>
                      )}

                      {selected.accountKind === "business_bank" &&
                      (lines.find((l) => l.id === activeLineId)?.amountCents ?? 0) < 0 ? (
                        <div className="stack gap-xs">
                          <p className="muted">Or post as new firm expense</p>
                          <label>
                            Category
                            <select
                              value={postCategory}
                              onChange={(e) => setPostCategory(e.target.value)}
                            >
                              {EXPENSE_CATEGORIES.map((c) => (
                                <option key={c} value={c}>
                                  {EXPENSE_CATEGORY_LABELS[c]}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Payee
                            <input
                              value={postPayee}
                              onChange={(e) => setPostPayee(e.target.value)}
                            />
                          </label>
                          <Button
                            type="button"
                            disabled={busy || !postPayee.trim()}
                            onClick={() =>
                              void lineAction(activeLineId, {
                                action: "post_expense",
                                category: postCategory,
                                payee: postPayee,
                              })
                            }
                          >
                            Post expense
                          </Button>
                        </div>
                      ) : null}

                      {selected.accountKind === "business_bank" &&
                      (lines.find((l) => l.id === activeLineId)?.amountCents ?? 0) > 0 ? (
                        <Button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void lineAction(activeLineId, { action: "post_cashbook_in" })
                          }
                        >
                          Post as cashbook receipt
                        </Button>
                      ) : null}

                      {selected.accountKind === "trust_bank" ? (
                        <p className="muted">
                          Trust lines can only be matched to existing trust ledger entries (client
                          tagging stays in Trust).
                        </p>
                      ) : null}

                      <div className="row gap-sm">
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => void lineAction(activeLineId, { action: "ignore" })}
                        >
                          Ignore
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => setActiveLineId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
