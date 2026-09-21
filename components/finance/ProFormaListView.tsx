"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Can } from "@/components/auth/Can";
import { FeeMoneyCallout } from "@/components/billing/FeeMoneyCallout";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SortableTh } from "@/components/ui/SortableTh";
import { centsToDisplay } from "@/lib/billing/money";
import { useTableSort } from "@/lib/ui/table-sort";

type ProformaItem = {
  id: string;
  proformaNumber: string;
  kind: string;
  kindLabel: string;
  conveyancingCategoryLabel: string | null;
  status: string;
  statusLabel: string;
  currency: string;
  clientDisplayLabel: string;
  matterTitle: string | null;
  matterNumber: string | null;
  totalCents: number;
  firmIncomeCents: number;
  clientCollectibleCents: number;
  createdAt: string;
};

function statusTone(status: string) {
  if (status === "sent") return "default" as const;
  if (status === "void") return "closed" as const;
  return "pending" as const;
}

export function ProFormaListView() {
  const [items, setItems] = useState<ProformaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [migrationHint, setMigrationHint] = useState<string | null>(null);
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMigrationHint(null);
    try {
      const params = new URLSearchParams();
      if (kind) params.set("kind", kind);
      if (status) params.set("status", status);
      const res = await fetch(`/api/finance/proformas?${params.toString()}`, {
        credentials: "include",
      });
      const body = (await res.json()) as {
        ok: boolean;
        requestId?: string;
        data?: {
          items: ProformaItem[];
          migrationNeeded?: boolean;
          migrationHint?: string;
        };
        error?: { message: string; requestId?: string };
      };
      if (!res.ok || !body.ok) {
        setError(
          body.error?.message ??
            `Could not load pro formas.${body.error?.requestId || body.requestId ? ` Reference: ${body.error?.requestId ?? body.requestId}` : ""}`,
        );
        setItems([]);
        return;
      }
      setItems(body.data?.items ?? []);
      if (body.data?.migrationNeeded) {
        setMigrationHint(
          body.data.migrationHint ??
            "Pro forma tables are missing. Run npm run db:migrate (0050_pro_formas).",
        );
      }
    } catch {
      setError("Could not load pro formas.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [kind, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const sortAccessors = useMemo(
    () => ({
      number: (r: ProformaItem) => r.proformaNumber,
      type: (r: ProformaItem) => r.kindLabel,
      client: (r: ProformaItem) => r.clientDisplayLabel,
      status: (r: ProformaItem) => r.statusLabel,
      firm: (r: ProformaItem) => r.firmIncomeCents ?? 0,
      collectible: (r: ProformaItem) => r.clientCollectibleCents ?? 0,
      total: (r: ProformaItem) => r.totalCents,
      created: (r: ProformaItem) => r.createdAt,
    }),
    [],
  );
  const { sortedRows, sortKey, sortDir, toggleSort } = useTableSort(items, sortAccessors, {
    key: "created",
    dir: "desc",
  });

  return (
    <section className="view active scrollable finance-desk-view proforma-page" aria-label="Pro formas">
      <div className="proforma-hero">
        <div>
          <h1>Pro forma invoices</h1>
          <p className="lede">
            Draft estimates for legal fees and conveyancing. Firm fees are pipeline earnings;
            collectibles are amounts to gather and pay onward. Nothing posts to the ledger until
            converted later.
          </p>
        </div>
        <Can
          permissions={["finance.quote.manage", "billing.manage"]}
          mode="any"
        >
          <Link href="/finance/proforma/new" className="btn btn-primary btn-sm">
            New pro forma
          </Link>
        </Can>
      </div>

      <FeeMoneyCallout />

      {migrationHint ? (
        <p role="status" className="finance-desk-callout">
          {migrationHint}
        </p>
      ) : null}

      <div className="proforma-section">
        <div className="quote-form-grid" style={{ marginBottom: "1rem" }}>
          <label>
            <span className="muted">Type</span>
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">All</option>
              <option value="legal_fees">Legal fees</option>
              <option value="conveyancing">Conveyancing</option>
            </select>
          </label>
          <label>
            <span className="muted">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="void">Void</option>
            </select>
          </label>
          <div style={{ alignSelf: "end" }}>
            <Button type="button" variant="outline" onClick={() => void load()}>
              Refresh
            </Button>
          </div>
        </div>

        {error ? (
          <p role="alert" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        ) : null}

        {loading ? <p className="muted">Loading…</p> : null}

        {!loading && !items.length && !error ? (
          <EmptyState
            title="No pro formas yet"
            detail="Create a legal-fees draft or a conveyancing estimate from one form."
            action={
              <Can permissions={["finance.quote.manage", "billing.manage"]} mode="any">
                <Link href="/finance/proforma/new" className="btn btn-primary btn-sm">
                  New pro forma
                </Link>
              </Can>
            }
          />
        ) : null}

        {!loading && items.length ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <SortableTh
                    label="Number"
                    columnKey="number"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="Type"
                    columnKey="type"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <th>Category</th>
                  <SortableTh
                    label="Client"
                    columnKey="client"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <th>Matter</th>
                  <SortableTh
                    label="Status"
                    columnKey="status"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="Firm fees"
                    columnKey="firm"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                    align="right"
                    className="num"
                  />
                  <SortableTh
                    label="Collectibles"
                    columnKey="collectible"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                    align="right"
                    className="num"
                  />
                  <SortableTh
                    label="Total"
                    columnKey="total"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                    align="right"
                    className="num"
                  />
                  <SortableTh
                    label="Created"
                    columnKey="created"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link href={`/finance/proforma/${row.id}`}>{row.proformaNumber}</Link>
                    </td>
                    <td>{row.kindLabel}</td>
                    <td>{row.conveyancingCategoryLabel ?? "—"}</td>
                    <td>{row.clientDisplayLabel}</td>
                    <td>
                      {row.matterNumber
                        ? `${row.matterNumber}${row.matterTitle ? ` · ${row.matterTitle}` : ""}`
                        : "—"}
                    </td>
                    <td>
                      <Badge tone={statusTone(row.status)}>{row.statusLabel}</Badge>
                    </td>
                    <td className="num">
                      {centsToDisplay(row.firmIncomeCents ?? 0, row.currency)}
                    </td>
                    <td className="num">
                      {centsToDisplay(row.clientCollectibleCents ?? 0, row.currency)}
                    </td>
                    <td className="num">{centsToDisplay(row.totalCents, row.currency)}</td>
                    <td>
                      {new Date(row.createdAt).toLocaleDateString(undefined, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  );
}
