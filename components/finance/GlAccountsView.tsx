"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExportMenu } from "@/components/export/ExportMenu";
import { AccountingSubNav } from "@/components/finance/AccountingSubNav";
import { FirmMoneyCallout } from "@/components/finance/FirmMoneyCallout";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SortableTh } from "@/components/ui/SortableTh";
import { useTableSort } from "@/lib/ui/table-sort";

type GlAccount = {
  id: string;
  code: string;
  name: string;
  type: string;
  parentId: string | null;
  isActive: boolean;
  isSystem: boolean;
  normalBalance: string;
  description: string | null;
};

export function GlAccountsView() {
  const [items, setItems] = useState<GlAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/finance/gl/accounts", { credentials: "include" });
      const body = (await res.json()) as {
        ok?: boolean;
        data?: { items?: GlAccount[] };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data?.items) {
        setError(body.error?.message ?? "Could not load chart of accounts.");
        setItems([]);
        return;
      }
      setItems(body.data.items);
    } catch {
      setError("Could not load chart of accounts.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sortAccessors = useMemo(
    () => ({
      code: (r: GlAccount) => r.code,
      name: (r: GlAccount) => r.name,
      type: (r: GlAccount) => r.type,
      normalBalance: (r: GlAccount) => r.normalBalance,
      status: (r: GlAccount) => (r.isActive ? "Active" : "Inactive"),
    }),
    [],
  );
  const { sortedRows, sortKey, sortDir, toggleSort } = useTableSort(items, sortAccessors, {
    key: "code",
    dir: "asc",
  });

  return (
    <section className="view active scrollable finance-desk-view" aria-label="Chart of accounts">
      <AccountingSubNav />
      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Chart of accounts</h2>
            <p className="muted">
              Default legal-style COA seeded per firm. System accounts cannot be deleted.
            </p>
          </div>
          <ExportMenu kind="gl_coa" formats={["pdf", "docx", "xlsx"]} disabled={loading} />
        </div>

        <FirmMoneyCallout />

        {loading ? <p className="muted">Loading accounts…</p> : null}
        {error ? <p className="error-text">{error}</p> : null}

        {!loading && !error && items.length === 0 ? (
          <EmptyState title="No accounts" detail="The chart of accounts will seed on first visit." />
        ) : null}

        {!loading && items.length > 0 ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <SortableTh
                    label="Code"
                    columnKey="code"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="Account"
                    columnKey="name"
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
                  <SortableTh
                    label="Normal balance"
                    columnKey="normalBalance"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="Status"
                    columnKey="status"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((a) => (
                  <tr key={a.id}>
                    <td>{a.code}</td>
                    <td>
                      {a.name}
                      {a.isSystem ? (
                        <Badge tone="default" className="ml-sm">
                          System
                        </Badge>
                      ) : null}
                    </td>
                    <td>{a.type.replace("_", " ")}</td>
                    <td>{a.normalBalance}</td>
                    <td>
                      <Badge tone={a.isActive ? "open" : "pending"}>
                        {a.isActive ? "Active" : "Inactive"}
                      </Badge>
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
