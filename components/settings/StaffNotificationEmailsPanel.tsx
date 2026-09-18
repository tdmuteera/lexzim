"use client";

import { useCallback, useEffect, useState } from "react";
import { Can } from "@/components/auth/Can";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

type StaffRow = {
  id: string;
  fullName: string;
  email: string;
  jobTitle: string | null;
  isActive: boolean;
  isSystemUser: boolean;
  communicationEmail?: string | null;
};

type DraftRow = {
  communicationEmail: string;
  saving: boolean;
  testing: boolean;
};

/**
 * Firm-wide allocator: which address each login receives for tasks, approvals,
 * calendar reminders, and requisitions. There is no separate webhook; LexZim
 * emails these addresses via firm SMTP (Settings → Email).
 */
export function StaffNotificationEmailsPanel() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftRow>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/staff?scope=system", { credentials: "include" });
      const body = (await res.json()) as {
        ok?: boolean;
        data?: { items?: StaffRow[] };
        error?: { message?: string };
      };
      if (!res.ok || !body.ok || !body.data?.items) {
        setError(body.error?.message ?? "Could not load staff notification emails.");
        setRows([]);
        return;
      }
      const items = body.data.items.filter((u) => u.isSystemUser && u.isActive);
      setRows(items);
      const next: Record<string, DraftRow> = {};
      for (const u of items) {
        next[u.id] = {
          communicationEmail: (u.communicationEmail ?? u.email ?? "").trim(),
          saving: false,
          testing: false,
        };
      }
      setDrafts(next);
    } catch {
      setError("Could not load staff notification emails.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveOne(userId: string) {
    const draft = drafts[userId];
    if (!draft?.communicationEmail.trim()) {
      toast("Enter a notification email before saving.");
      return;
    }
    setDrafts((prev) => ({
      ...prev,
      [userId]: { ...prev[userId]!, saving: true },
    }));
    try {
      const res = await fetch(`/api/users/${userId}/communication-email`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: draft.communicationEmail.trim() }),
      });
      const body = (await res.json()) as {
        ok?: boolean;
        data?: { communicationEmail?: string };
        error?: { message?: string };
      };
      if (!res.ok || !body.ok) {
        toast(body.error?.message ?? "Could not save notification email.");
        return;
      }
      const saved = body.data?.communicationEmail ?? draft.communicationEmail.trim();
      setDrafts((prev) => ({
        ...prev,
        [userId]: { ...prev[userId]!, communicationEmail: saved, saving: false },
      }));
      setRows((prev) =>
        prev.map((r) => (r.id === userId ? { ...r, communicationEmail: saved } : r)),
      );
      toast("Notification email saved.");
    } catch {
      toast("Could not save notification email.");
    } finally {
      setDrafts((prev) => ({
        ...prev,
        [userId]: { ...prev[userId]!, saving: false },
      }));
    }
  }

  async function testOne(userId: string) {
    const draft = drafts[userId];
    const email = draft?.communicationEmail.trim();
    if (!email) {
      toast("Enter a notification email before sending a test.");
      return;
    }
    setDrafts((prev) => ({
      ...prev,
      [userId]: { ...prev[userId]!, testing: true },
    }));
    try {
      const res = await fetch(`/api/users/${userId}/communication-email/test`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = (await res.json()) as {
        ok?: boolean;
        data?: { to?: string; from?: string };
        error?: { message?: string };
      };
      if (!res.ok || !body.ok) {
        toast(body.error?.message ?? "Could not send test email.");
        return;
      }
      toast(`Test email sent to ${body.data?.to ?? email}.`);
    } catch {
      toast("Could not send test email.");
    } finally {
      setDrafts((prev) => ({
        ...prev,
        [userId]: { ...prev[userId]!, testing: false },
      }));
    }
  }

  return (
    <Can
      permission="users.manage"
      fallback={
        <p className="muted" style={{ margin: 0 }}>
          Only users with User access can allocate staff notification emails.
        </p>
      }
    >
      <div className="settings-form">
        <div className="settings-form-head">
          <p className="settings-lede">
            Set the address LexZim uses for each person&apos;s task assignments, invoice approvals,
            requisitions, and calendar notices. This can differ from their login email. Outbound
            mail is sent through Settings → Email and shows the firm as sender (for example{" "}
            <strong>T Pfigu Attorneys</strong>). Use <strong>Send test mail</strong> to confirm how
            it looks on their phone.
          </p>
          <aside className="settings-hint settings-callout" style={{ marginTop: "0.75rem" }}>
            There is no separate webhook. Recipients are these notification emails. People can also
            update their own address under Settings → Account profile.
          </aside>
        </div>

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        {loading ? <p className="muted">Loading…</p> : null}

        {!loading && rows.length === 0 ? (
          <p className="muted">No active system logins yet.</p>
        ) : null}

        {!loading && rows.length > 0 ? (
          <div style={{ display: "grid", gap: "0.85rem" }}>
            {rows.map((u) => {
              const draft = drafts[u.id];
              const busy = Boolean(draft?.saving || draft?.testing);
              return (
                <div
                  key={u.id}
                  className="settings-section"
                  style={{
                    display: "grid",
                    gap: "0.45rem",
                    maxWidth: "36rem",
                    paddingBottom: "0.85rem",
                    borderBottom: "1px solid var(--border, rgba(0,0,0,0.08))",
                  }}
                >
                  <div>
                    <strong style={{ fontSize: "0.95rem" }}>{u.fullName}</strong>
                    {u.jobTitle ? (
                      <span className="muted" style={{ marginLeft: "0.5rem", fontSize: "0.82rem" }}>
                        {u.jobTitle}
                      </span>
                    ) : null}
                    <div className="muted" style={{ fontSize: "0.78rem", marginTop: "0.15rem" }}>
                      Login: {u.email}
                    </div>
                  </div>
                  <label>
                    <div className="muted" style={{ fontSize: "0.8rem" }}>
                      Notification email (tasks / approvals / calendar)
                    </div>
                    <input
                      type="email"
                      value={draft?.communicationEmail ?? ""}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [u.id]: {
                            communicationEmail: e.target.value,
                            saving: prev[u.id]?.saving ?? false,
                            testing: prev[u.id]?.testing ?? false,
                          },
                        }))
                      }
                      placeholder="name@example.com"
                      style={{ width: "100%", marginTop: "0.25rem", padding: "0.45rem 0.6rem" }}
                    />
                  </label>
                  <div className="settings-actions" style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void saveOne(u.id)}
                    >
                      {draft?.saving ? "Saving…" : "Save"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void testOne(u.id)}
                    >
                      {draft?.testing ? "Sending…" : "Send test mail"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        <div className="settings-actions" style={{ marginTop: "0.75rem" }}>
          <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
        </div>
      </div>
    </Can>
  );
}
