"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { WorkflowModuleNav } from "@/components/workflow/WorkflowModuleNav";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

type InboxItem = {
  kind: "leave" | "salary_advance" | "invoice" | "password_reset";
  id: string;
  title: string;
  subtitle: string;
  href: string;
  createdAt: string;
  permissionNeeded: string;
};

function kindLabel(kind: InboxItem["kind"]) {
  if (kind === "leave") return "Leave";
  if (kind === "salary_advance") return "Advance";
  if (kind === "invoice") return "Invoice";
  return "Password";
}

function kindTone(kind: InboxItem["kind"]) {
  if (kind === "invoice") return "pending" as const;
  if (kind === "password_reset") return "danger" as const;
  return "closed" as const;
}

function formatWhen(value: string) {
  return new Date(value).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ApprovalsInboxView() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/workflow/approvals", { credentials: "include" });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { items: InboxItem[] };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Could not load approvals.");
        return;
      }
      setItems(body.data.items);
    } catch {
      setError("Could not load approvals.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="view active scrollable" aria-label="Approvals">
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>Approvals inbox</h3>
            <p className="muted" style={{ marginTop: "0.25rem" }}>
              Leave, salary advances, invoice approval, and password resets waiting on you.
            </p>
          </div>
          <div className="panel-actions">
            <Button type="button" size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
              Refresh
            </Button>
          </div>
        </div>
        <div className="panel-body">
          <WorkflowModuleNav />

          {error ? (
            <p className="form-error" role="alert" style={{ marginTop: "1rem" }}>
              {error}
            </p>
          ) : null}

          {loading ? (
            <p className="muted" style={{ marginTop: "1rem" }}>
              Loading approvals…
            </p>
          ) : items.length === 0 ? (
            <div style={{ marginTop: "1rem" }}>
              <EmptyState
                title="Nothing waiting"
                detail="When leave, advances, invoices, or password resets need your tick, they appear here."
                icon="check"
              />
            </div>
          ) : (
            <div className="table-wrap" style={{ marginTop: "1rem" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Item</th>
                    <th>When</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={`${item.kind}-${item.id}`}>
                      <td>
                        <Badge tone={kindTone(item.kind)}>{kindLabel(item.kind)}</Badge>
                      </td>
                      <td>
                        <strong>{item.title}</strong>
                        <div className="muted" style={{ fontSize: "0.85rem" }}>
                          {item.subtitle}
                        </div>
                      </td>
                      <td>{formatWhen(item.createdAt)}</td>
                      <td>
                        <Link href={item.href} className="btn btn-sm btn-outline">
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="muted" style={{ marginTop: "1rem", fontSize: "0.9rem" }}>
            Firm tasks are under <Link href="/workflow/tasks">Tasks</Link>. Approvals still
            happen on their source screens; this inbox links you there.
          </p>
        </div>
      </div>
    </section>
  );
}
