"use client";

import { useCallback, useEffect, useState } from "react";
import { Can } from "@/components/auth/Can";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

const MAX_EMAILS = 3;

type StaffRow = {
  id: string;
  fullName: string;
  email: string;
  jobTitle: string | null;
  isActive: boolean;
  isSystemUser: boolean;
  communicationEmail?: string | null;
  communicationEmails?: string[];
};

type DraftRow = {
  emails: string[];
  saving: boolean;
  testing: boolean;
};

function padEmails(emails: string[]): string[] {
  const next = emails.slice(0, MAX_EMAILS);
  while (next.length < MAX_EMAILS) next.push("");
  return next;
}

/**
 * Firm-wide allocator: up to three addresses per person for tasks, approvals,
 * calendar reminders, and requisitions (e.g. business + personal). LexZim
 * emails these via firm SMTP (Settings → Email). Requires users.manage.
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
        const fromList =
          Array.isArray(u.communicationEmails) && u.communicationEmails.length > 0
            ? u.communicationEmails
            : [(u.communicationEmail ?? u.email ?? "").trim()].filter(Boolean);
        next[u.id] = {
          emails: padEmails(fromList),
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

  function setEmailSlot(userId: string, index: number, value: string) {
    setDrafts((prev) => {
      const draft = prev[userId];
      if (!draft) return prev;
      const emails = [...draft.emails];
      emails[index] = value;
      return {
        ...prev,
        [userId]: { ...draft, emails },
      };
    });
  }

  async function saveOne(userId: string) {
    const draft = drafts[userId];
    const emails = (draft?.emails ?? [])
      .map((e) => e.trim())
      .filter(Boolean);
    if (emails.length === 0) {
      toast("Enter at least one notification email before saving.");
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
        body: JSON.stringify({ emails }),
      });
      const body = (await res.json()) as {
        ok?: boolean;
        data?: {
          communicationEmail?: string;
          communicationEmails?: string[];
        };
        error?: { message?: string };
      };
      if (!res.ok || !body.ok) {
        toast(body.error?.message ?? "Could not save notification emails.");
        return;
      }
      const saved =
        body.data?.communicationEmails ??
        (body.data?.communicationEmail ? [body.data.communicationEmail] : emails);
      setDrafts((prev) => ({
        ...prev,
        [userId]: {
          ...prev[userId]!,
          emails: padEmails(saved),
          saving: false,
        },
      }));
      setRows((prev) =>
        prev.map((r) =>
          r.id === userId
            ? {
                ...r,
                communicationEmail: saved[0] ?? null,
                communicationEmails: saved,
              }
            : r,
        ),
      );
      toast(
        saved.length === 1
          ? "Notification email saved."
          : `${saved.length} notification emails saved. Each will get the same staff notices.`,
      );
    } catch {
      toast("Could not save notification emails.");
    } finally {
      setDrafts((prev) => ({
        ...prev,
        [userId]: { ...prev[userId]!, saving: false },
      }));
    }
  }

  async function testOne(userId: string) {
    const draft = drafts[userId];
    const emails = (draft?.emails ?? [])
      .map((e) => e.trim())
      .filter(Boolean);
    if (emails.length === 0) {
      toast("Enter at least one notification email before sending a test.");
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
        body: JSON.stringify({ emails }),
      });
      const body = (await res.json()) as {
        ok?: boolean;
        data?: { to?: string; recipients?: string[]; from?: string };
        error?: { message?: string };
      };
      if (!res.ok || !body.ok) {
        toast(body.error?.message ?? "Could not send test email.");
        return;
      }
      const sentTo =
        body.data?.recipients?.join(", ") ??
        body.data?.to ??
        emails.join(", ");
      toast(`Test email sent to ${sentTo}.`);
    } catch {
      toast("Could not send test email.");
    } finally {
      setDrafts((prev) => ({
        ...prev,
        [userId]: { ...prev[userId]!, testing: false },
      }));
    }
  }

  const labels = [
    "Primary notification email (usually business)",
    "Second email (e.g. personal inbox)",
    "Third email (optional backup)",
  ];

  return (
    <Can
      permission="users.manage"
      fallback={
        <p className="muted" style={{ margin: 0 }}>
          Only system admins with User access can assign staff notification emails.
        </p>
      }
    >
      <div className="settings-form">
        <div className="settings-form-head">
          <p className="settings-lede">
            Assign up to three addresses per person for task assignments, invoice approvals,
            requisitions, and calendar notices. Use a firm domain address plus a personal
            inbox when the work laptop is unavailable. Every listed address receives the same
            staff notification. Outbound mail uses Settings → Email (firm SMTP on Railway).
          </p>
          <aside className="settings-hint settings-callout" style={{ marginTop: "0.75rem" }}>
            Only admins with <strong>users.manage</strong> can set second and third emails.
            Staff can still update their primary address under Settings → Account profile.
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
                  {(draft?.emails ?? padEmails([])).map((value, index) => (
                    <label key={`${u.id}-email-${index}`}>
                      <div className="muted" style={{ fontSize: "0.8rem" }}>
                        {labels[index]}
                      </div>
                      <input
                        type="email"
                        value={value}
                        onChange={(e) => setEmailSlot(u.id, index, e.target.value)}
                        placeholder={
                          index === 0
                            ? "name@yourfirm.co.zw"
                            : index === 1
                              ? "personal@example.com"
                              : "optional@example.com"
                        }
                        style={{ width: "100%", marginTop: "0.25rem", padding: "0.45rem 0.6rem" }}
                      />
                    </label>
                  ))}
                  <div
                    className="settings-actions"
                    style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}
                  >
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
