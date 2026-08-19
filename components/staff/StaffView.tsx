"use client";

import { useCallback, useEffect, useState } from "react";
import { Can } from "@/components/auth/Can";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/components/auth/AuthProvider";
import { formatDateTime } from "@/lib/format/dates";
import { AccessChecklist } from "@/components/staff/AccessChecklist";

type StaffRow = {
  id: string;
  email: string;
  fullName: string;
  jobTitle: string | null;
  isActive: boolean;
  roleCode: string;
  roleName: string;
  lastLoginAt: string | null;
  permissionCodes: string[];
  isProtectedMp: boolean;
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

const DEFAULT_TICKS = ["dashboard.view"];

export function StaffView() {
  const { toast } = useToast();
  const { user: me, refresh } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<StaffRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [seats, setSeats] = useState<SeatsInfo | null>(null);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [password, setPassword] = useState("");
  const [createTicks, setCreateTicks] = useState<string[]>(DEFAULT_TICKS);
  const [issuedTemp, setIssuedTemp] = useState<{ email: string; tempPassword: string } | null>(
    null,
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTicks, setEditTicks] = useState<string[]>([]);
  const [editJobTitle, setEditJobTitle] = useState("");

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

  function startEdit(u: StaffRow) {
    setEditingId(u.id);
    setEditTicks(u.permissionCodes ?? []);
    setEditJobTitle(u.jobTitle ?? "");
  }

  async function onCreate() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/staff", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          fullName,
          jobTitle: jobTitle.trim() || undefined,
          password: password.trim() || undefined,
          permissionCodes: createTicks,
        }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { tempPassword?: string | null; user?: { email: string } };
        error?: { message: string; code?: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not create user.");
        return;
      }
      if (body.data?.tempPassword && body.data.user?.email) {
        setIssuedTemp({ email: body.data.user.email, tempPassword: body.data.tempPassword });
      } else {
        toast("User created.");
      }
      setEmail("");
      setFullName("");
      setJobTitle("");
      setPassword("");
      setCreateTicks(DEFAULT_TICKS);
      await load();
    } catch {
      setError("Could not create user.");
    } finally {
      setSaving(false);
    }
  }

  async function onSaveAccess() {
    if (!editingId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/staff/${editingId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobTitle: editJobTitle,
          permissionCodes: editTicks,
        }),
      });
      const body = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not update access.");
        return;
      }
      toast("Access updated.");
      setEditingId(null);
      await load();
      if (editingId === me?.id) await refresh();
    } catch {
      setError("Could not update access.");
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

  const editing = items.find((u) => u.id === editingId) ?? null;

  return (
    <Can permission="users.manage">
      <div className="view active scrollable" aria-label="Staff">
        <div className="toolbar">
          <div>
            <h1 style={{ margin: 0, fontSize: "1.15rem" }}>Lawyers &amp; Staff</h1>
            <p className="muted" style={{ margin: "0.25rem 0 0" }}>
              Create a login, then tick the modules that person may use. Help is always available.
            </p>
            {seats ? (
              <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.85rem" }}>
                Active logins: {seats.used} of {seats.limit}
                {seats.edition ? ` (${seats.edition} licence)` : ""}. Inactive people do not use a
                seat.
              </p>
            ) : null}
          </div>
          <Button variant="ghost" onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
        </div>

        {seats !== null && seats.remaining <= 0 ? (
          <div
            className="panel"
            style={{ marginBottom: "1rem", borderColor: "var(--gold, #b8860b)" }}
            role="status"
          >
            <div className="panel-body">
              <strong>No free login seats</strong>
              <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.88rem" }}>
                This trial licence allows {seats.limit} people signed in at once. All {seats.used}{" "}
                are already Active in the list below. Click <strong>Deactivate</strong> on a login
                you are not using (you cannot deactivate yourself). Then you can create the new
                user. Deactivated people keep their ticks and can be reactivated later if a seat is
                free.
              </p>
            </div>
          </div>
        ) : null}

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
          <div className="panel-body" style={{ display: "grid", gap: "0.65rem" }}>
            <strong>Create user</strong>
            <div className="grid-2">
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
            </div>
            <div className="grid-2">
              <label>
                <div className="muted" style={{ fontSize: "0.8rem" }}>
                  Job title
                </div>
                <input
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="e.g. Associate, Accounts clerk"
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
            </div>
            <AccessChecklist selected={createTicks} onChange={setCreateTicks} disabled={saving} />
            <Button
              variant="gold"
              onClick={() => void onCreate()}
              disabled={saving || loading || (seats !== null && seats.remaining <= 0)}
            >
              {saving ? "Creating…" : "Create user"}
            </Button>
            {seats !== null && seats.remaining <= 0 ? (
              <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>
                Create stays off until a seat is free. Use Deactivate on a user in the list below.
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
                    padding: "0.55rem 0",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: "0.75rem",
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: "12rem" }}>
                      <div style={{ fontWeight: 600 }}>{u.fullName}</div>
                      <div className="muted" style={{ fontSize: "0.8rem" }}>
                        {u.email}
                        {u.jobTitle ? ` · ${u.jobTitle}` : ""}
                      </div>
                    </div>
                    <Badge tone="pending">{u.jobTitle || u.roleName}</Badge>
                    <Badge tone={u.isActive ? "open" : "closed"}>
                      {u.isActive ? "Active" : "Inactive"}
                    </Badge>
                    <span className="muted" style={{ fontSize: "0.75rem" }}>
                      {u.lastLoginAt
                        ? `Last login ${formatDateTime(u.lastLoginAt)}`
                        : "Never logged in"}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={saving}
                      onClick={() => (editingId === u.id ? setEditingId(null) : startEdit(u))}
                    >
                      {editingId === u.id ? "Close" : "Edit access"}
                    </Button>
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
                  {editingId === u.id && editing ? (
                    <div style={{ marginTop: "0.75rem" }}>
                      <label style={{ display: "block", marginBottom: "0.65rem", maxWidth: "22rem" }}>
                        <div className="muted" style={{ fontSize: "0.8rem" }}>
                          Job title
                        </div>
                        <input
                          value={editJobTitle}
                          onChange={(e) => setEditJobTitle(e.target.value)}
                          style={{ width: "100%", marginTop: "0.25rem", padding: "0.45rem 0.6rem" }}
                        />
                      </label>
                      <AccessChecklist
                        selected={editTicks}
                        onChange={setEditTicks}
                        disabled={saving}
                        lockUsersManage={u.isProtectedMp || u.id === me?.id}
                      />
                      <div style={{ marginTop: "0.65rem", display: "flex", gap: "0.5rem" }}>
                        <Button size="sm" onClick={() => void onSaveAccess()} disabled={saving}>
                          {saving ? "Saving…" : "Save access"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
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
