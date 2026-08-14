"use client";

import { useCallback, useEffect, useState } from "react";
import { Can } from "@/components/auth/Can";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime } from "@/lib/format/dates";

type ResetRow = {
  id: string;
  userId: string | null;
  email: string;
  status: string;
  requestedAt: string;
  fullName: string | null;
  roleName: string | null;
};

export function SecurityPanel() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ResetRow[]>([]);
  const [issued, setIssued] = useState<{ email: string; tempPassword: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/security/reset-requests", { credentials: "include" });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { items: ResetRow[] };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data) {
        setError(body.error?.message ?? "Could not load reset requests.");
        return;
      }
      setItems(body.data.items);
    } catch {
      setError("Could not load reset requests.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function resolve(requestId: string, action: "approve" | "reject") {
    if (action === "reject" && !window.confirm("Reject this reset request?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/security/reset-requests", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, action }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { email?: string; tempPassword?: string };
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not resolve request.");
        return;
      }
      if (action === "approve" && body.data?.tempPassword && body.data.email) {
        setIssued({ email: body.data.email, tempPassword: body.data.tempPassword });
      } else {
        toast("Request rejected.");
      }
      await load();
    } catch {
      setError("Could not resolve request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Can
      permission="users.manage"
      fallback={<p className="settings-hint">Security queue is restricted to managing partners.</p>}
    >
      <div className="settings-form">
        <div className="settings-form-head">
          <p className="settings-lede">
            Password reset requests from the login screen. There is no automatic email reset link.
            Approve to issue a one-time temporary password (shown once here); the user is forced to
            change it on next login.
          </p>
          {error ? (
            <p role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem" }}>
              {error}
            </p>
          ) : null}
        </div>

        {issued ? (
          <div
            className="panel"
            style={{ marginBottom: "1rem", borderColor: "var(--gold, #b8860b)" }}
          >
            <div className="panel-body" style={{ display: "grid", gap: "0.4rem" }}>
              <strong>Temporary password issued</strong>
              <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>
                Share this securely with {issued.email}. It is shown only once and cannot be
                retrieved later.
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
                {issued.tempPassword}
              </code>
              <div>
                <Button size="sm" variant="outline" onClick={() => setIssued(null)}>
                  Done
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <section className="settings-section">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 className="settings-section-title">Pending reset requests</h3>
            <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
              Refresh
            </Button>
          </div>

          {loading ? (
            <p className="muted" style={{ fontSize: "0.85rem" }}>Loading…</p>
          ) : items.length === 0 ? (
            <p className="muted" style={{ fontSize: "0.85rem" }}>No pending requests.</p>
          ) : (
            <div style={{ display: "grid", gap: "0.5rem" }}>
              {items.map((r) => (
                <div
                  key={r.id}
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
                    <div style={{ fontWeight: 600 }}>{r.fullName ?? r.email}</div>
                    <div className="muted" style={{ fontSize: "0.8rem" }}>
                      {r.email}
                      {r.roleName ? ` · ${r.roleName}` : " · not a known active user"}
                    </div>
                  </div>
                  <span className="muted" style={{ fontSize: "0.75rem" }}>
                    Requested {formatDateTime(r.requestedAt)}
                  </span>
                  {r.userId ? (
                    <Button
                      size="sm"
                      variant="gold"
                      disabled={busy}
                      onClick={() => void resolve(r.id, "approve")}
                    >
                      Approve &amp; issue
                    </Button>
                  ) : (
                    <Badge tone="closed">No user</Badge>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void resolve(r.id, "reject")}
                  >
                    Reject
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </Can>
  );
}
