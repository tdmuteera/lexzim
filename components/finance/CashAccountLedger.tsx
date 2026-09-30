"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { EmptyState } from "@/components/ui/EmptyState";
import { centsToDisplay } from "@/lib/billing/money";

export type CashLedgerCode = "1010" | "1020" | "1050" | "1060";

type Movement = {
  entryId: string;
  entryDate: string;
  reference: string | null;
  memo: string | null;
  sourceType: string;
  postedBy: string | null;
  inCents: number;
  outCents: number;
  balanceAfterCents: number;
  reversed: boolean;
};

type LedgerData = { label: string; balanceCents: number; movements: Movement[] };

const SOURCE_LABELS: Record<string, string> = {
  payment: "Receipt",
  payment_intake: "Receipt",
  trust_fee: "Fee transfer",
  expense: "Expense",
  funds_transfer: "Transfer",
  float: "Float",
  opening: "Opening balance",
  manual: "Journal",
};

/** Balance and every general ledger posting on one firm cash account, with the running balance. */
export function CashAccountLedger({
  code,
  refreshKey = 0,
  title,
  onBalance,
}: {
  code: CashLedgerCode;
  refreshKey?: number;
  title?: string;
  onBalance?: (balanceCents: number) => void;
}) {
  const { user } = useAuth();
  const currency = user?.firm?.defaultCurrency || "USD";
  const [data, setData] = useState<LedgerData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/finance/cash-accounts?code=${code}`, { credentials: "include" });
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          data?: LedgerData;
          error?: { message?: string };
        };
        if (cancelled) return;
        if (!res.ok || !body.ok || !body.data) {
          setError(body.error?.message ?? "Could not load the account.");
          return;
        }
        setError(null);
        setData(body.data);
        onBalance?.(body.data.balanceCents);
      } catch {
        if (!cancelled) setError("Could not load the account.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, refreshKey, onBalance]);

  return (
    <div className="panel" style={{ marginBottom: "1rem" }}>
      <div className="panel-head">
        <div>
          <h3>{title ?? data?.label ?? "Account"}</h3>
          <p className="panel-subtitle muted">GL account {code}. Figures come straight from the general ledger.</p>
        </div>
        <strong style={{ fontSize: "1.25rem" }}>
          {data ? centsToDisplay(data.balanceCents, currency) : "…"}
        </strong>
      </div>
      <div className="panel-body">
        {error ? (
          <p role="alert" style={{ color: "var(--danger)", margin: 0 }}>
            {error}
          </p>
        ) : !data ? (
          <p className="muted" style={{ margin: 0 }}>
            Loading…
          </p>
        ) : !data.movements.length ? (
          <EmptyState title="No postings yet" detail="Money in and out of this account will be listed here." />
        ) : (
          <div className="table-wrap">
            <table className="data data-dense">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Detail</th>
                  <th>Posted by</th>
                  <th className="num">In</th>
                  <th className="num">Out</th>
                  <th className="num">Balance</th>
                </tr>
              </thead>
              <tbody>
                {data.movements.map((m) => (
                  <tr key={m.entryId} style={m.reversed ? { opacity: 0.6 } : undefined}>
                    <td>{new Date(m.entryDate).toLocaleDateString()}</td>
                    <td>{SOURCE_LABELS[m.sourceType] ?? m.sourceType}</td>
                    <td>
                      {m.memo ?? m.reference ?? ""}
                      {m.reversed ? <span className="muted"> (reversed)</span> : null}
                    </td>
                    <td>{m.postedBy ?? ""}</td>
                    <td className="num">{m.inCents ? centsToDisplay(m.inCents, currency) : ""}</td>
                    <td className="num" style={{ color: m.outCents ? "var(--danger)" : undefined }}>
                      {m.outCents ? centsToDisplay(m.outCents, currency) : ""}
                    </td>
                    <td className="num" style={{ fontWeight: 600 }}>
                      {centsToDisplay(m.balanceAfterCents, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
