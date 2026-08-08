"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Can } from "@/components/auth/Can";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

type IntakeItem = {
  id: string;
  prospectName: string;
  status: string;
  statusNormalized: string;
  statusLabel: string;
  contactEmail: string | null;
  contactPhone: string | null;
  areaOfLaw: string | null;
  opposingParty: string | null;
  assigneeName: string | null;
  updatedAt: string;
};

function toneFor(status: string) {
  if (status === "converted") return "open" as const;
  if (status === "declined") return "danger" as const;
  if (status === "archived") return "closed" as const;
  return "pending" as const;
}

export function IntakeListView() {
  const [items, setItems] = useState<IntakeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("open");
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (showArchived && !status) params.set("archived", "1");
      const res = await fetch(`/api/intakes?${params.toString()}`, {
        credentials: "include",
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { items: IntakeItem[] };
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not load intakes.");
        setItems([]);
        return;
      }
      setItems(body.data?.items ?? []);
    } catch {
      setError("Could not load intakes.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [status, showArchived]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="view active scrollable" aria-label="Intake">
      <div className="panel">
        <div className="panel-head">
          <h3>Intake &amp; prospects</h3>
          <Can permission="intake.manage">
            <Link href="/intake/new" className="btn btn-primary btn-sm">
              New intake
            </Link>
          </Can>
        </div>
        <div className="panel-body">
          <p className="muted" style={{ marginTop: 0, fontSize: "0.8rem" }}>
            Capture prospects in-app. Saving does not create a client. Conflict search and
            Use conflict check then convert on the intake detail page. No public portal yet.
          </p>

          <div className="toolbar">
            <select
              className="filter-select"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              aria-label="Filter status"
            >
              <option value="open">Open</option>
              <option value="declined">Declined</option>
              <option value="converted">Converted</option>
              <option value="archived">Archived</option>
              <option value="">All (except archived)</option>
            </select>
            <label
              style={{ display: "flex", gap: "0.4rem", alignItems: "center", fontSize: "0.8rem" }}
            >
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => {
                  setShowArchived(e.target.checked);
                  if (e.target.checked) setStatus("");
                }}
              />
              Include archived in All
            </label>
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

          {loading && !items.length ? (
            <p className="muted" style={{ fontSize: "0.85rem" }}>
              Loading…
            </p>
          ) : null}

          {!loading && items.length === 0 ? (
            <EmptyState
              title="No intakes"
              detail="Create a prospect capture. Clients are not auto-created."
            />
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Prospect</th>
                  <th>Status</th>
                  <th>Area</th>
                  <th>Opposing</th>
                  <th>Assignee</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link href={`/intake/${row.id}`}>{row.prospectName}</Link>
                      <div className="muted" style={{ fontSize: "0.72rem" }}>
                        {[row.contactEmail, row.contactPhone].filter(Boolean).join(" · ")}
                      </div>
                    </td>
                    <td>
                      <Badge tone={toneFor(row.statusNormalized)}>{row.statusLabel}</Badge>
                    </td>
                    <td>{row.areaOfLaw ?? "n/a"}</td>
                    <td>{row.opposingParty ?? "n/a"}</td>
                    <td>{row.assigneeName ?? "Unassigned"}</td>
                    <td>{new Date(row.updatedAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}
