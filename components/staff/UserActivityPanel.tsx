"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { formatDateTime } from "@/lib/format/dates";

type LoginOption = {
  id: string;
  fullName: string;
  email: string;
};

type ActivityRow = {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown>;
  ipOrUserAgent: string | null;
  userId: string | null;
  userFullName: string | null;
  userEmail: string | null;
  createdAt: string;
};

function formatMetadata(meta: Record<string, unknown>): string {
  const keys = Object.keys(meta);
  if (keys.length === 0) return "";
  const parts: string[] = [];
  for (const key of keys.slice(0, 4)) {
    const val = meta[key];
    if (val == null || val === "") continue;
    const text = typeof val === "object" ? JSON.stringify(val) : String(val);
    if (text.length > 80) {
      parts.push(`${key}: ${text.slice(0, 77)}…`);
    } else {
      parts.push(`${key}: ${text}`);
    }
  }
  if (keys.length > 4) parts.push(`+${keys.length - 4} more`);
  return parts.join(" · ");
}

function entityLabel(row: ActivityRow): string {
  if (!row.entityType && !row.entityId) return "—";
  if (row.entityType && row.entityId) return `${row.entityType} ${row.entityId}`;
  return row.entityType ?? row.entityId ?? "—";
}

export function UserActivityPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ActivityRow[]>([]);
  const [loginUsers, setLoginUsers] = useState<LoginOption[]>([]);
  const [filterUserId, setFilterUserId] = useState("");

  const sortedLogins = useMemo(
    () => [...loginUsers].sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [loginUsers],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = filterUserId ? `?userId=${encodeURIComponent(filterUserId)}` : "";
      const res = await fetch(`/api/staff/activity${q}`, { credentials: "include" });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { items: ActivityRow[]; loginUsers?: LoginOption[] };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Could not load user activity.");
        setItems([]);
        return;
      }
      setItems(body.data.items);
      if (body.data.loginUsers) setLoginUsers(body.data.loginUsers);
    } catch {
      setError("Could not load user activity.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filterUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="settings-form">
      <div className="settings-form-head">
        <p className="settings-lede">
          Recent actions in your firm: logins, edits, downloads, and approvals. Grant{" "}
          <strong>View user activity</strong> under Edit access to let others open this section
          without the full Audit Log.
        </p>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem",
          alignItems: "flex-end",
          justifyContent: "space-between",
          marginBottom: "0.85rem",
        }}
      >
        <label>
          <div className="muted" style={{ fontSize: "0.8rem" }}>
            User
          </div>
          <select
            className="filter-select"
            value={filterUserId}
            onChange={(e) => setFilterUserId(e.target.value)}
          >
            <option value="">All users</option>
            {sortedLogins.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName}
              </option>
            ))}
          </select>
        </label>
        <Button variant="ghost" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? <p className="muted">Loading…</p> : null}

      {!loading && !error && items.length === 0 ? (
        <p className="muted">No activity recorded yet for this filter.</p>
      ) : null}

      {!loading && items.length > 0 ? (
        <div className="hr-activity-table-wrap">
          <table className="hr-activity-table">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">User</th>
                <th scope="col">Action</th>
                <th scope="col">Record</th>
                <th scope="col">Details</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => {
                const meta = formatMetadata(row.metadata);
                return (
                  <tr key={row.id}>
                    <td>{formatDateTime(row.createdAt)}</td>
                    <td>
                      {row.userFullName ?? "System"}
                      {row.userEmail ? (
                        <div className="muted" style={{ fontSize: "0.75rem" }}>
                          {row.userEmail}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <code style={{ fontSize: "0.78rem" }}>{row.action}</code>
                    </td>
                    <td style={{ fontSize: "0.82rem" }}>{entityLabel(row)}</td>
                    <td className="muted" style={{ fontSize: "0.78rem" }}>
                      {meta || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
