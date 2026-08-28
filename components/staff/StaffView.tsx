"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Can } from "@/components/auth/Can";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/components/auth/AuthProvider";
import { formatDateTime } from "@/lib/format/dates";
import { HrStatStrip } from "@/components/hr/HrStatStrip";
import { AccessChecklist } from "@/components/staff/AccessChecklist";
import { DelegationsPanel } from "@/components/staff/DelegationsPanel";

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

type StaffRow = {
  id: string;
  email: string;
  fullName: string;
  jobTitle: string | null;
  isActive: boolean;
  isSystemUser: boolean;
  isLawyer: boolean;
  isTestUser?: boolean;
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

type StaffTab = "logins" | "lawyers" | "delegations";

const DEFAULT_TICKS = ["dashboard.view"];

export function StaffView() {
  const { toast } = useToast();
  const { user: me, refresh } = useAuth();
  const [tab, setTab] = useState<StaffTab>("logins");
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
  const [isLawyer, setIsLawyer] = useState(true);
  const [isTestUser, setIsTestUser] = useState(false);
  const [createTicks, setCreateTicks] = useState<string[]>(DEFAULT_TICKS);
  const [issuedTemp, setIssuedTemp] = useState<{ email: string; tempPassword: string } | null>(
    null,
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTicks, setEditTicks] = useState<string[]>([]);
  const [editJobTitle, setEditJobTitle] = useState("");
  const [editIsLawyer, setEditIsLawyer] = useState(false);

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

  const loginUsers = useMemo(() => items.filter((u) => u.isSystemUser), [items]);
  const directoryLawyers = useMemo(
    () => items.filter((u) => !u.isSystemUser),
    [items],
  );
  const visible =
    tab === "logins" ? loginUsers : tab === "lawyers" ? directoryLawyers : [];

  function startEdit(u: StaffRow) {
    setEditingId(u.id);
    setEditTicks(u.permissionCodes ?? []);
    setEditJobTitle(u.jobTitle ?? "");
    setEditIsLawyer(u.isLawyer);
  }

  async function onCreateLogin() {
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
          isSystemUser: true,
          isLawyer,
          isTestUser,
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
      setIsLawyer(true);
      setIsTestUser(false);
      setCreateTicks(DEFAULT_TICKS);
      await load();
    } catch {
      setError("Could not create user.");
    } finally {
      setSaving(false);
    }
  }

  async function onCreateDirectoryLawyer() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/staff", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim() || undefined,
          fullName,
          jobTitle: jobTitle.trim() || "Lawyer",
          isSystemUser: false,
          isLawyer: true,
        }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not add lawyer.");
        return;
      }
      toast("Lawyer added. They can be selected as responsible attorney on clients and matters.");
      setEmail("");
      setFullName("");
      setJobTitle("");
      await load();
    } catch {
      setError("Could not add lawyer.");
    } finally {
      setSaving(false);
    }
  }

  async function onSaveAccess() {
    if (!editingId) return;
    setSaving(true);
    setError(null);
    try {
      const editing = items.find((u) => u.id === editingId);
      const payload: Record<string, unknown> = {
        jobTitle: editJobTitle,
        isLawyer: editIsLawyer,
      };
      if (editing?.isSystemUser) {
        payload.permissionCodes = editTicks;
      }
      const res = await fetch(`/api/staff/${editingId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not update.");
        return;
      }
      toast("Saved.");
      setEditingId(null);
      await load();
      if (editingId === me?.id) await refresh();
    } catch {
      setError("Could not update.");
    } finally {
      setSaving(false);
    }
  }

  async function setActive(userId: string, activate: boolean) {
    const label = activate ? "Reactivate" : "Deactivate";
    if (!window.confirm(`${label} this person?`)) return;
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
      toast(activate ? "Reactivated." : "Deactivated.");
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

  const summaryStats = useMemo(
    () => [
      {
        label: "Login seats",
        value: seats ? `${seats.used}/${seats.limit}` : "—",
        hint: seats?.edition,
        icon: "SE",
      },
      { label: "System logins", value: loading ? "—" : loginUsers.length, icon: "IN" },
      { label: "Practice lawyers", value: loading ? "—" : directoryLawyers.length, icon: "LW" },
      { label: "Active sessions", value: loading ? "—" : sessions.length, icon: "SS" },
    ],
    [seats, loading, loginUsers.length, directoryLawyers.length, sessions.length],
  );

  return (
    <Can permission="users.manage">
      <section className="view active scrollable hr-desk-view hr-staff-access-view" aria-label="Staff">
        <div className="panel hr-hero-panel">
          <div className="panel-head">
            <div>
              <h1>Lawyers &amp; Staff</h1>
              <p className="panel-subtitle muted">
                System logins use seats. Practice lawyers without a login can still be responsible
                attorneys on clients and matters.
              </p>
              {seats ? (
                <p className="muted hr-aging-note">
                  Active logins: {seats.used} of {seats.limit}
                  {seats.edition ? ` (${seats.edition} licence)` : ""}. Directory lawyers do not use a
                  seat.
                </p>
              ) : null}
            </div>
            <div className="hr-panel-actions">
              <Button variant="ghost" onClick={() => void load()} disabled={loading}>
                Refresh
              </Button>
            </div>
          </div>
        </div>

        <HrStatStrip stats={summaryStats} />

        <div className="tabs module-tabs-inline">
          <button
            type="button"
            className={["tab", tab === "logins" ? "active" : ""].filter(Boolean).join(" ")}
            onClick={() => {
              setTab("logins");
              setEditingId(null);
            }}
          >
            System logins ({loginUsers.length})
          </button>
          <button
            type="button"
            className={["tab", tab === "lawyers" ? "active" : ""].filter(Boolean).join(" ")}
            onClick={() => {
              setTab("lawyers");
              setEditingId(null);
            }}
          >
            Practice lawyers ({directoryLawyers.length})
          </button>
          <button
            type="button"
            className={["tab", tab === "delegations" ? "active" : ""].filter(Boolean).join(" ")}
            onClick={() => {
              setTab("delegations");
              setEditingId(null);
            }}
          >
            Delegations
          </button>
        </div>

        {tab === "delegations" ? (
          <DelegationsPanel loginUsers={loginUsers} currentUserId={me?.id} />
        ) : (
          <>
        {tab === "logins" && seats !== null && seats.remaining <= 0 ? (
          <div className="panel hr-notice-panel" role="status">
            <div className="panel-body">
              <strong>No free login seats</strong>
              <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.88rem" }}>
                Deactivate an unused login, or add a practice lawyer on the other tab (no seat
                needed) if they only need to appear as responsible attorney.
              </p>
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="form-error" role="alert">{error}</p>
        ) : null}

        {issuedTemp ? (
          <div className="panel hr-notice-panel">
            <div className="panel-body" style={{ display: "grid", gap: "0.4rem" }}>
              <strong>Temporary password for {issuedTemp.email}</strong>
              <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>
                Share this securely. Shown once; they must change it on first login.
              </p>
              <code className="hr-temp-password-code">{issuedTemp.tempPassword}</code>
              <div>
                <Button size="sm" variant="outline" onClick={() => setIssuedTemp(null)}>
                  Done
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="panel hr-form-panel">
          <div className="panel-body" style={{ display: "grid", gap: "0.65rem" }}>
            <strong className="hr-section-title">
              {tab === "logins" ? "Create system login" : "Add practice lawyer (no login)"}
            </strong>
            <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
              {tab === "logins"
                ? "Creates a LexZim login and uses one seat. Tick modules they may use."
                : "For lawyers who practice and bring revenue but do not need system access. They appear in responsible attorney lists on clients and matters."}
            </p>
            <div className="hr-grid-2">
              <label>
                <div className="muted" style={{ fontSize: "0.8rem" }}>
                  Full name
                </div>
                <input
                  className="filter-input"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </label>
              <label>
                <div className="muted" style={{ fontSize: "0.8rem" }}>
                  {tab === "logins" ? "Email" : "Email (optional)"}
                </div>
                <input
                  className="filter-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={tab === "lawyers" ? "Optional contact email" : undefined}
                />
              </label>
            </div>
            <div className="hr-grid-2">
              <label>
                <div className="muted" style={{ fontSize: "0.8rem" }}>
                  Job title
                </div>
                <input
                  className="filter-input"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder={tab === "lawyers" ? "e.g. Advocate, Associate" : "e.g. Associate, Accounts"}
                />
              </label>
              {tab === "logins" ? (
                <label>
                  <div className="muted" style={{ fontSize: "0.8rem" }}>
                    Temporary password (leave blank to auto-generate)
                  </div>
                  <input
                    className="filter-input"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Auto-generated if blank"
                    autoComplete="new-password"
                  />
                </label>
              ) : (
                <div />
              )}
            </div>
            {tab === "logins" ? (
              <>
                <label className="hr-checkbox-row">
                  <input
                    type="checkbox"
                    checked={isLawyer}
                    onChange={(e) => setIsLawyer(e.target.checked)}
                  />
                  <span style={{ fontSize: "0.9rem" }}>
                    This person is a lawyer (show in responsible attorney lists)
                  </span>
                </label>
                <label className="hr-checkbox-row">
                  <input
                    type="checkbox"
                    checked={isTestUser}
                    onChange={(e) => setIsTestUser(e.target.checked)}
                  />
                  <span style={{ fontSize: "0.9rem" }}>
                    Test user (not an employee — skip HR profile)
                  </span>
                </label>
                <AccessChecklist selected={createTicks} onChange={setCreateTicks} disabled={saving} />
                <Button
                  variant="gold"
                  onClick={() => void onCreateLogin()}
                  disabled={saving || loading || (seats !== null && seats.remaining <= 0)}
                >
                  {saving ? "Creating…" : "Create user"}
                </Button>
              </>
            ) : (
              <Button
                variant="gold"
                onClick={() => void onCreateDirectoryLawyer()}
                disabled={saving || loading || !fullName.trim()}
              >
                {saving ? "Saving…" : "Add lawyer"}
              </Button>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-body hr-panel-body">
            <strong className="hr-section-title">
              {tab === "logins" ? "Users with login" : "Practice lawyers (no login)"}
            </strong>
            {loading ? <p className="hr-empty-loading">Loading…</p> : null}
            {!loading && visible.length === 0 ? (
              <p className="muted">
                {tab === "logins" ? "No login users yet." : "No directory lawyers yet."}
              </p>
            ) : null}
            <div className="hr-user-list">
              {visible.map((u) => (
                <div key={u.id} className="hr-user-row">
                  <div className="hr-user-row-main">
                    <div className="hr-avatar" aria-hidden="true">{initials(u.fullName)}</div>
                    <div className="hr-user-row-body">
                      <div className="hr-cell-primary">{u.fullName}</div>
                      <div className="hr-cell-meta">
                        {u.email.includes("@") && !u.email.includes(".lexzim.local")
                          ? u.email
                          : u.isSystemUser
                            ? u.email
                            : "No login email"}
                        {u.jobTitle ? ` · ${u.jobTitle}` : ""}
                      </div>
                    </div>
                    {u.isLawyer ? <Badge tone="open">Lawyer</Badge> : null}
                    {u.isTestUser ? <Badge tone="pending">Test</Badge> : null}
                    {!u.isSystemUser ? <Badge tone="pending">No login</Badge> : null}
                    <Badge tone={u.isActive ? "open" : "closed"}>
                      {u.isActive ? "Active" : "Inactive"}
                    </Badge>
                    {u.isSystemUser ? (
                      <span className="muted" style={{ fontSize: "0.75rem" }}>
                        {u.lastLoginAt
                          ? `Last login ${formatDateTime(u.lastLoginAt)}`
                          : "Never logged in"}
                      </span>
                    ) : null}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={saving}
                      onClick={() => (editingId === u.id ? setEditingId(null) : startEdit(u))}
                    >
                      {editingId === u.id ? "Close" : u.isSystemUser ? "Edit access" : "Edit"}
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
                    {u.isSystemUser && u.isActive ? (
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
                    <div className="hr-detail-panel" style={{ marginTop: "0.75rem" }}>
                      <label style={{ display: "block", marginBottom: "0.65rem", maxWidth: "22rem" }}>
                        <div className="muted" style={{ fontSize: "0.8rem" }}>
                          Job title
                        </div>
                        <input
                          className="filter-input"
                          value={editJobTitle}
                          onChange={(e) => setEditJobTitle(e.target.value)}
                        />
                      </label>
                      <label className="hr-checkbox-row" style={{ marginBottom: "0.65rem" }}>
                        <input
                          type="checkbox"
                          checked={editIsLawyer}
                          onChange={(e) => setEditIsLawyer(e.target.checked)}
                        />
                        <span style={{ fontSize: "0.9rem" }}>
                          Lawyer (responsible attorney lists)
                        </span>
                      </label>
                      {editing.isSystemUser ? (
                        <AccessChecklist
                          selected={editTicks}
                          onChange={setEditTicks}
                          disabled={saving}
                          lockUsersManage={u.isProtectedMp || u.id === me?.id}
                        />
                      ) : null}
                      <div className="hr-form-actions">
                        <Button size="sm" onClick={() => void onSaveAccess()} disabled={saving}>
                          {saving ? "Saving…" : "Save"}
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

        {tab === "logins" ? (
          <div className="panel">
            <div className="panel-body hr-panel-body">
              <strong className="hr-section-title">Active web sessions</strong>
              <p className="muted hr-detail-subtitle">
                Sessions are recorded on login. Revoking signs that browser out.
              </p>
              {sessions.length === 0 ? (
                <p className="muted">No active tracked sessions yet.</p>
              ) : (
                <div className="hr-user-list">
                  {sessions.map((s) => (
                    <div key={s.id} className="hr-user-row">
                      <div className="hr-user-row-main">
                        <div className="hr-avatar" aria-hidden="true">{initials(s.fullName)}</div>
                        <div className="hr-user-row-body">
                          <div className="hr-cell-primary">{s.fullName}</div>
                          <div className="hr-cell-meta">
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
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
          </>
        )}
      </section>
    </Can>
  );
}
