"use client";

import { useCallback, useEffect, useState } from "react";
import { Can } from "@/components/auth/Can";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/components/auth/AuthProvider";
import { formatDateTime } from "@/lib/format/dates";

type StaffRow = {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  roleCode: string;
  roleName: string;
  lastLoginAt: string | null;
};

type SeatsInfo = {
  limit: number;
  used: number;
  remaining: number;
  edition?: string;
};

type SessionRow = {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  ipOrUserAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
};

export function StaffView() {
  const { toast } = useToast();
  const { user: me } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<StaffRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [seats, setSeats] = useState<SeatsInfo | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [roleCode, setRoleCode] = useState("junior_associate");
  const [issuedTemp, setIssuedTemp] = useState<{ email: string; tempPassword: string } | null>(
    null,
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [staffRes, sessRes] = await Promise.all([
        fetch("/api/staff", { credentials: "include" }),
        fetch("/api/staff/sessions", { credentials: "include" }),
      ]);
      const body = (await staffRes.json()) as {
        ok: boolean;
        data?: {
          items: StaffRow[];
          seats: SeatsInfo;
          invitableRoles?: string[];
        };
        error?: { message: string };
      };
      const sessBody = (await sessRes.json()) as {
        ok: boolean;
        data?: { items: SessionRow[] };
      };
      if (!staffRes.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Could not load staff.");
        return;
      }
      setItems(body.data.items);
      setSeats(body.data.seats);
      setRoles(body.data.invitableRoles ?? ["junior_associate"]);
      setSessions(sessBody.data?.items ?? []);
    } catch {
      setError("Could not load staff.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onInvite() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/staff", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, fullName, password: password.trim() || undefined, roleCode }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { tempPassword?: string | null; user?: { email: string } };
        error?: { message: string; code?: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not invite user.");
        return;
      }
      if (body.data?.tempPassword && body.data.user?.email) {
        setIssuedTemp({ email: body.data.user.email, tempPassword: body.data.tempPassword });
      } else {
        toast("User invited.");
      }
      setEmail("");
      setFullName("");
      setPassword("");
      await load();
    } catch {
      setError("Could not invite user.");
    } finally {
      setSaving(false);
    }
  }

  async function setActive(userId: string, activate: boolean) {
    const label = activate ? "Reactivate" : "Deactivate";
    if (!window.confirm(`${label} this user?`)) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/sessions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: activate ? "reactivate" : "deactivate",
          userId,
        }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? `Could not ${label.toLowerCase()}.`);
        return;
      }
      toast(activate ? "User reactivated." : "User deactivated; sessions revoked.");
      await load();
    } catch {
      setError(`Could not ${label.toLowerCase()}.`);
    } finally {
      setSaving(false);
    }
  }

  async function revokeSession(registryId: string) {
    if (!window.confirm("Revoke this web session? The user will need to sign in again.")) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/sessions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke", registryId }),
      });
      const body = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not revoke session.");
        return;
      }
      toast("Session revoked.");
      await load();
    } catch {
      setError("Could not revoke session.");
    } finally {
      setSaving(false);
    }
  }

  async function revokeAllForUser(userId: string) {
    if (!window.confirm("Revoke all tracked web sessions for this user?")) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/sessions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "revoke_all",
          userId,
          keepCurrent: userId === me?.id,
        }),
      });
      const body = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not revoke sessions.");
        return;
      }
      toast("Sessions revoked.");
      await load();
    } catch {
      setError("Could not revoke sessions.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Can permission="users.manage">
      <div className="view active scrollable" aria-label="Staff">
        <div className="toolbar">
          <div>
            <h1 style={{ margin: 0, fontSize: "1.15rem" }}>Lawyers &amp; Staff</h1>
            <p className="muted" style={{ margin: "0.25rem 0 0" }}>
              Invite, deactivate, and revoke web sessions within your licence seat limit
              {seats
                ? ` (${seats.used}/${seats.limit} seats${seats.edition ? `, ${seats.edition}` : ""})`
                : ""}
            </p>
          </div>
          <Button variant="ghost" onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
        </div>

        {error ? (
          <p style={{ color: "var(--danger)", fontSize: "0.9rem" }}>{error}</p>
        ) : null}

        {issuedTemp ? (
          <div className="panel" style={{ marginBottom: "1rem", borderColor: "var(--gold, #b8860b)" }}>
            <div className="panel-body" style={{ display: "grid", gap: "0.4rem" }}>
              <strong>Temporary password for {issuedTemp.email}</strong>
              <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>
                Share this securely with the new user. It is shown only once and they must change it
                on first login.
              </p>
              <code
                style={{
                  fontSize: "1.05rem",
                  padding: "0.5rem 0.75rem",
                  background: "rgba(0,0,0,0.05)",
                  borderRadius: "6px",
                  userSelect: "all",
                }}
              >
                {issuedTemp.tempPassword}
              </code>
              <div>
                <Button size="sm" variant="outline" onClick={() => setIssuedTemp(null)}>
                  Done
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="panel" style={{ marginBottom: "1rem" }}>
          <div className="panel-body" style={{ display: "grid", gap: "0.65rem", maxWidth: "28rem" }}>
            <strong>Invite user</strong>
            <label>
              <div className="muted" style={{ fontSize: "0.8rem" }}>
                Full name
              </div>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                style={{ width: "100%", marginTop: "0.25rem", padding: "0.45rem 0.6rem" }}
              />
            </label>
            <label>
              <div className="muted" style={{ fontSize: "0.8rem" }}>
                Email
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ width: "100%", marginTop: "0.25rem", padding: "0.45rem 0.6rem" }}
              />
            </label>
            <label>
              <div className="muted" style={{ fontSize: "0.8rem" }}>
                Temporary password (leave blank to auto-generate)
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Auto-generated if blank"
                autoComplete="new-password"
                style={{ width: "100%", marginTop: "0.25rem", padding: "0.45rem 0.6rem" }}
              />
            </label>
            <label>
              <div className="muted" style={{ fontSize: "0.8rem" }}>
                Role
              </div>
              <select
                value={roleCode}
                onChange={(e) => setRoleCode(e.target.value)}
                style={{ width: "100%", marginTop: "0.25rem", padding: "0.45rem 0.6rem" }}
              >
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <Button
              variant="gold"
              onClick={() => void onInvite()}
              disabled={saving || loading || (seats !== null && seats.remaining <= 0)}
            >
              {saving ? "Inviting…" : "Invite"}
            </Button>
            {seats !== null && seats.remaining <= 0 ? (
              <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>
                Seat limit reached. Deactivate a user or upgrade the licence.
              </p>
            ) : null}
          </div>
        </div>

        <div className="panel" style={{ marginBottom: "1rem" }}>
          <div className="panel-body">
            <strong style={{ display: "block", marginBottom: "0.65rem" }}>Users</strong>
            {loading ? <p className="muted">Loading…</p> : null}
            {!loading && items.length === 0 ? (
              <p className="muted">No users yet.</p>
            ) : null}
            <div style={{ display: "grid", gap: "0.5rem" }}>
              {items.map((u) => (
                <div
                  key={u.id}
                  style={{
                    display: "flex",
                    gap: "0.75rem",
                    alignItems: "center",
                    flexWrap: "wrap",
                    padding: "0.55rem 0",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <div style={{ flex: 1, minWidth: "12rem" }}>
                    <div style={{ fontWeight: 600 }}>{u.fullName}</div>
                    <div className="muted" style={{ fontSize: "0.8rem" }}>
                      {u.email}
                    </div>
                  </div>
                  <Badge tone="pending">{u.roleName}</Badge>
                  <Badge tone={u.isActive ? "open" : "closed"}>
                    {u.isActive ? "Active" : "Inactive"}
                  </Badge>
                  <span className="muted" style={{ fontSize: "0.75rem" }}>
                    {u.lastLoginAt
                      ? `Last login ${formatDateTime(u.lastLoginAt)}`
                      : "Never logged in"}
                  </span>
                  {u.id !== me?.id ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={saving}
                      onClick={() => void setActive(u.id, !u.isActive)}
                    >
                      {u.isActive ? "Deactivate" : "Reactivate"}
                    </Button>
                  ) : null}
                  {u.isActive ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={saving}
                      onClick={() => void revokeAllForUser(u.id)}
                    >
                      Revoke sessions
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-body">
            <strong style={{ display: "block", marginBottom: "0.35rem" }}>
              Active web sessions
            </strong>
            <p className="muted" style={{ margin: "0 0 0.65rem", fontSize: "0.85rem" }}>
              Replaces desktop device pairing. Sessions are recorded on login. Revoking blocks
              further use of that session (JWT may linger until expiry; refresh is cleared when
              possible).
            </p>
            {sessions.length === 0 ? (
              <p className="muted">No active tracked sessions yet. Sign in again to register.</p>
            ) : (
              <div style={{ display: "grid", gap: "0.45rem" }}>
                {sessions.map((s) => (
                  <div
                    key={s.id}
                    style={{
                      display: "flex",
                      gap: "0.75rem",
                      alignItems: "center",
                      flexWrap: "wrap",
                      padding: "0.45rem 0",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: "12rem" }}>
                      <div style={{ fontWeight: 600 }}>{s.fullName}</div>
                      <div className="muted" style={{ fontSize: "0.8rem" }}>
                        {s.email}
                        {s.ipOrUserAgent ? ` · ${s.ipOrUserAgent.slice(0, 80)}` : ""}
                      </div>
                    </div>
                    <span className="muted" style={{ fontSize: "0.75rem" }}>
                      Seen {formatDateTime(s.lastSeenAt)}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={saving}
                      onClick={() => void revokeSession(s.id)}
                    >
                      Revoke
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Can>
  );
}
