"use client";

import { useEffect, useState } from "react";
import { diagnosticJson } from "@/lib/diagnostics/client";
import { formatDateTime } from "@/lib/format/dates";
import { Button } from "@/components/ui/Button";

type AuditItem = {
  id: string;
  action: string;
  entityType: string | null;
  createdAt: string;
  actorName: string | null;
};

function actionLabel(action: string): string {
  return action.replace(/[._]/g, " ");
}

export function AuditLogView() {
  const [items, setItems] = useState<AuditItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const result = await diagnosticJson<{ items: AuditItem[] }>("/api/audit");
      if (!result.ok || !result.data) {
        setError(result.error?.message ?? "Could not load the audit log.");
        setItems([]);
        return;
      }
      setItems(result.data.items);
    } catch {
      setError("Could not load the audit log.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <section className="view active scrollable" aria-label="Audit log">
      <div className="panel">
        <div className="panel-head">
          <h3>Audit log</h3>
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
        </div>
        <div className="panel-body">
          <p className="muted" style={{ marginTop: 0 }}>
            Recent sensitive actions in this firm. Newest first.
          </p>
          {error ? <p role="alert">{error}</p> : null}
          {loading ? <p className="muted">Loading the audit log...</p> : null}
          {!loading && !error && items.length === 0 ? (
            <p className="muted">No actions recorded yet.</p>
          ) : null}
          {items.length > 0 ? (
            <table className="data">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Action</th>
                  <th>Record</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{formatDateTime(item.createdAt)}</td>
                    <td>{item.actorName || "Unknown"}</td>
                    <td>{actionLabel(item.action)}</td>
                    <td>{item.entityType || "Firm"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      </div>
    </section>
  );
}
