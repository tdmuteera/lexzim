"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SortableTh } from "@/components/ui/SortableTh";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime } from "@/lib/format/dates";
import { useTableSort } from "@/lib/ui/table-sort";

type Capability = {
  code: string;
  label: string;
  description: string;
};

type GrantRow = {
  id: string;
  capability: string;
  label: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  grantorName: string;
  granteeName: string;
  granteeEmail: string;
  status: "active" | "expired" | "revoked";
};

type LoginOption = {
  id: string;
  fullName: string;
  email: string;
};

type Props = {
  loginUsers: LoginOption[];
  currentUserId: string | undefined;
};

export function DelegationsPanel({ loginUsers, currentUserId }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<GrantRow[]>([]);
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [granteeUserId, setGranteeUserId] = useState("");
  const [capability, setCapability] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = showHistory ? "?activeOnly=0" : "";
      const res = await fetch(`/api/staff/delegations${q}`, {
        credentials: "include",
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { items: GrantRow[]; capabilities: Capability[] };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Could not load delegations.");
        return;
      }
      setItems(body.data.items);
      setCapabilities(body.data.capabilities);
      setCapability((prev) => prev || body.data!.capabilities[0]?.code || "");
    } catch {
      setError("Could not load delegations.");
    } finally {
      setLoading(false);
    }
  }, [showHistory]);

  useEffect(() => {
    void load();
  }, [load]);

  const granteeOptions = loginUsers.filter((u) => u.id !== currentUserId);

  async function createGrant() {
    if (!granteeUserId || !capability) {
      setError("Choose a person and a capability.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/delegations", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          granteeUserId,
          capability,
          expiresAt: expiresAt.trim() ? new Date(expiresAt).toISOString() : null,
        }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not grant.");
        return;
      }
      toast("Delegation granted.");
      setExpiresAt("");
      await load();
    } catch {
      setError("Could not grant.");
    } finally {
      setSaving(false);
    }
  }

  async function revokeGrant(grantId: string) {
    if (!window.confirm("Revoke this delegation?")) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/delegations", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grantId }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not revoke.");
        return;
      }
      toast("Delegation revoked.");
      await load();
    } catch {
      setError("Could not revoke.");
    } finally {
      setSaving(false);
    }
  }

  const accessors = useMemo(
    () => ({
      person: (r: GrantRow) => r.granteeName,
      capability: (r: GrantRow) => r.label,
      status: (r: GrantRow) => r.status,
      granted: (r: GrantRow) => r.createdAt,
      expires: (r: GrantRow) => r.expiresAt,
    }),
    [],
  );
  const { sortedRows, sortKey, sortDir, toggleSort } = useTableSort(items, accessors, {
    key: "granted",
    dir: "desc",
  });

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <p className="muted" style={{ margin: 0, fontSize: "0.88rem" }}>
        Temporary overlay on top of module ticks. The Managing Partner keeps full access.
        Delegated people gain the capability while the grant is active (optional expiry).
      </p>

      {error ? (
        <p style={{ color: "var(--danger)", fontSize: "0.9rem", margin: 0 }}>{error}</p>
      ) : null}

      <div className="panel">
        <div className="panel-body" style={{ display: "grid", gap: "0.65rem" }}>
          <strong>Grant capability</strong>
          <div className="grid-2">
            <label>
              <div className="muted" style={{ fontSize: "0.8rem" }}>
                Person (system login)
              </div>
              <select
                value={granteeUserId}
                onChange={(e) => setGranteeUserId(e.target.value)}
                style={{ width: "100%", marginTop: "0.25rem", padding: "0.45rem 0.6rem" }}
              >
                <option value="">Select…</option>
                {granteeOptions.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName} ({u.email})
                  </option>
                ))}
              </select>
            </label>
            <label>
              <div className="muted" style={{ fontSize: "0.8rem" }}>
                Capability
              </div>
              <select
                value={capability}
                onChange={(e) => setCapability(e.target.value)}
                style={{ width: "100%", marginTop: "0.25rem", padding: "0.45rem 0.6rem" }}
              >
                {capabilities.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            <div className="muted" style={{ fontSize: "0.8rem" }}>
              Expires (optional)
            </div>
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              style={{ width: "100%", maxWidth: "20rem", marginTop: "0.25rem", padding: "0.45rem 0.6rem" }}
            />
          </label>
          {capability ? (
            <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>
              {capabilities.find((c) => c.code === capability)?.description}
            </p>
          ) : null}
          <div>
            <Button onClick={() => void createGrant()} disabled={saving || !granteeUserId}>
              Grant
            </Button>
          </div>
        </div>
      </div>

      <div className="toolbar" style={{ margin: 0 }}>
        <strong style={{ fontSize: "0.95rem" }}>
          {showHistory ? "All grants" : "Active grants"}
        </strong>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowHistory((v) => !v)}
            disabled={loading}
          >
            {showHistory ? "Show active only" : "Include history"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="muted">No delegation grants yet.</p>
      ) : (
        <div className="panel">
          <div className="panel-body" style={{ padding: 0 }}>
            <table className="data-table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <SortableTh label="Person" columnKey="person" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                  <SortableTh label="Capability" columnKey="capability" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                  <SortableTh label="Status" columnKey="status" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                  <SortableTh label="Granted" columnKey="granted" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                  <SortableTh label="Expires" columnKey="expires" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                  <th />
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((g) => (
                  <tr key={g.id}>
                    <td>
                      <div>{g.granteeName}</div>
                      <div className="muted" style={{ fontSize: "0.78rem" }}>
                        {g.granteeEmail}
                      </div>
                    </td>
                    <td>{g.label}</td>
                    <td>
                      <Badge
                        tone={
                          g.status === "active"
                            ? "open"
                            : g.status === "expired"
                              ? "pending"
                              : "closed"
                        }
                      >
                        {g.status}
                      </Badge>
                    </td>
                    <td style={{ fontSize: "0.85rem" }}>
                      {formatDateTime(g.createdAt)}
                      <div className="muted" style={{ fontSize: "0.75rem" }}>
                        by {g.grantorName}
                      </div>
                    </td>
                    <td style={{ fontSize: "0.85rem" }}>
                      {g.expiresAt ? formatDateTime(g.expiresAt) : "None"}
                    </td>
                    <td>
                      {g.status === "active" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={saving}
                          onClick={() => void revokeGrant(g.id)}
                        >
                          Revoke
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
