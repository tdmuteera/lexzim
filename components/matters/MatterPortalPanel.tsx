"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Can } from "@/components/auth/Can";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatDateTime } from "@/lib/format/dates";

type PortalUser = {
  id: string;
  email: string;
  fullName: string;
  clientId: string;
  isActive: boolean;
  hasPassword: boolean;
  lastLoginAt: string | null;
};

type MatterShare = {
  id: string;
  type: "matter";
  clientId: string;
  matterId: string;
  permission: string;
  sharedAt: string;
  revokedAt: string | null;
};

type DocShare = {
  id: string;
  type: "document";
  clientId: string;
  documentId: string;
  permission: string;
  sharedAt: string;
  revokedAt: string | null;
  documentTitle: string;
  fileName: string;
};

type DocItem = {
  id: string;
  title: string;
  fileName: string;
};

type ActivityItem = {
  id: string;
  action: string;
  createdAt: string;
  metadata: Record<string, unknown>;
};

type InboxItem = {
  id: string;
  title: string;
  fileName: string;
  sizeBytes: number | null;
  status: string;
  createdAt: string;
};

type MatterPortalPanelProps = {
  matterId: string;
  clientId: string;
  clientDisplayName: string | null;
};

export function MatterPortalPanel({
  matterId,
  clientId,
  clientDisplayName,
}: MatterPortalPanelProps) {
  const [portalUsers, setPortalUsers] = useState<PortalUser[]>([]);
  const [matterShares, setMatterShares] = useState<MatterShare[]>([]);
  const [docShares, setDocShares] = useState<DocShare[]>([]);
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [virusNote, setVirusNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState(clientDisplayName ?? "");
  const [invitePassword, setInvitePassword] = useState("");
  const [magicLink, setMagicLink] = useState<string | null>(null);
  const [shareDocId, setShareDocId] = useState("");
  const [allowUpload, setAllowUpload] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersRes, matterShareRes, docShareRes, docsRes, actRes, inboxRes] =
        await Promise.all([
          fetch("/api/portal/invites", { credentials: "include" }),
          fetch(`/api/portal/shares?matterId=${encodeURIComponent(matterId)}`, {
            credentials: "include",
          }),
          fetch(
            `/api/portal/shares?type=document&matterId=${encodeURIComponent(matterId)}`,
            { credentials: "include" },
          ),
          fetch(`/api/matters/${matterId}/documents`, { credentials: "include" }),
          fetch(`/api/portal/activity?matterId=${encodeURIComponent(matterId)}`, {
            credentials: "include",
          }),
          fetch(
            `/api/portal/inbox?matterId=${encodeURIComponent(matterId)}&status=pending`,
            { credentials: "include" },
          ),
        ]);

      const usersBody = (await usersRes.json()) as {
        ok: boolean;
        data?: { items: PortalUser[] };
        error?: { message: string };
      };
      const matterBody = (await matterShareRes.json()) as {
        ok: boolean;
        data?: { items: MatterShare[] };
      };
      const docBody = (await docShareRes.json()) as {
        ok: boolean;
        data?: { items: DocShare[] };
      };
      const docsBody = (await docsRes.json()) as {
        ok: boolean;
        data?: { items: DocItem[] };
      };
      const actBody = (await actRes.json()) as {
        ok: boolean;
        data?: { items: ActivityItem[] };
      };
      const inboxBody = (await inboxRes.json()) as {
        ok: boolean;
        data?: { items: InboxItem[]; virusScanNote?: string };
      };

      if (!usersRes.ok || !usersBody.ok) {
        setError(usersBody.error?.message ?? "Could not load portal users.");
      }

      const matterItems = (matterBody.data?.items ?? []).filter((s) => !s.revokedAt);
      setPortalUsers(
        (usersBody.data?.items ?? []).filter((u) => u.clientId === clientId && u.isActive),
      );
      setMatterShares(matterItems);
      setAllowUpload(matterItems.some((s) => s.permission === "read_upload"));
      setDocShares((docBody.data?.items ?? []).filter((s) => !s.revokedAt));
      setDocs(docsBody.data?.items ?? []);
      setActivity(actBody.data?.items ?? []);
      setInbox(inboxBody.data?.items ?? []);
      setVirusNote(inboxBody.data?.virusScanNote ?? null);
    } catch {
      setError("Could not load portal panel.");
    } finally {
      setLoading(false);
    }
  }, [matterId, clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function invite(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOkMsg(null);
    setMagicLink(null);
    try {
      const res = await fetch("/api/portal/invites", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          email: inviteEmail,
          fullName: inviteName || clientDisplayName || "Client",
          password: invitePassword || undefined,
          createMagicLink: true,
        }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { magicLinkUrl?: string | null };
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Invite failed.");
        return;
      }
      setOkMsg("Portal user invited (or updated).");
      if (body.data?.magicLinkUrl) setMagicLink(body.data.magicLinkUrl);
      setInvitePassword("");
      await load();
    } catch {
      setError("Invite failed.");
    } finally {
      setBusy(false);
    }
  }

  async function shareMatter() {
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      const res = await fetch("/api/portal/shares", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "matter",
          clientId,
          matterId,
          permission: allowUpload ? "read_upload" : "read",
        }),
      });
      const body = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not share matter.");
        return;
      }
      setOkMsg(
        allowUpload
          ? "Matter shared with portal upload inbox enabled."
          : "Matter shared to portal for this client.",
      );
      await load();
    } catch {
      setError("Could not share matter.");
    } finally {
      setBusy(false);
    }
  }

  async function reviewInbox(uploadId: string, action: "accept" | "dismiss") {
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      const res = await fetch("/api/portal/inbox", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId, action }),
      });
      const body = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not update inbox item.");
        return;
      }
      setOkMsg(action === "accept" ? "Upload accepted into matter documents." : "Upload dismissed.");
      await load();
    } catch {
      setError("Could not update inbox item.");
    } finally {
      setBusy(false);
    }
  }

  async function revokeShare(type: "matter" | "document", shareId: string) {
    if (!window.confirm("Revoke portal access for this share?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/shares", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revoke: true, type, shareId }),
      });
      const body = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Revoke failed.");
        return;
      }
      setOkMsg("Access revoked.");
      await load();
    } catch {
      setError("Revoke failed.");
    } finally {
      setBusy(false);
    }
  }

  async function shareDocument() {
    if (!shareDocId) {
      setError("Choose a document to share.");
      return;
    }
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      const res = await fetch("/api/portal/shares", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "document",
          clientId,
          documentId: shareDocId,
          permission: "read",
        }),
      });
      const body = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not share document.");
        return;
      }
      setOkMsg("Document shared to portal.");
      setShareDocId("");
      await load();
    } catch {
      setError("Could not share document.");
    } finally {
      setBusy(false);
    }
  }

  function actionLabel(action: string): string {
    const map: Record<string, string> = {
      "portal.matter_shared": "Matter shared",
      "portal.matter_share_revoked": "Matter share revoked",
      "portal.document_shared": "Document shared",
      "portal.document_share_revoked": "Document share revoked",
      "portal.document_download": "Client downloaded document",
      "portal.matter_viewed": "Client viewed matter",
      "portal.inbox_upload": "Client uploaded to inbox",
      "portal.inbox_accepted": "Inbox upload accepted",
      "portal.inbox_dismissed": "Inbox upload dismissed",
      "portal.user_invited": "Portal user invited",
      "portal.login": "Portal login",
    };
    return map[action] ?? action;
  }

  return (
    <Can permissions={["matters.edit", "matters.create", "clients.edit"]} mode="any">
      <div style={{ display: "grid", gap: "1.25rem" }}>
        <div>
          <h4 style={{ margin: "0 0 0.35rem" }}>Share to client portal</h4>
          <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
            Default is share nothing. Invite the client, then share this matter and any documents
            they may download. Portal access is separate from staff login.
          </p>
        </div>

        {error ? <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p> : null}
        {okMsg ? <p style={{ color: "var(--success, green)", margin: 0 }}>{okMsg}</p> : null}
        {magicLink ? (
          <p className="muted" style={{ fontSize: "0.8rem", wordBreak: "break-all", margin: 0 }}>
            Dev magic link: <a href={magicLink}>{magicLink}</a>
          </p>
        ) : null}

        {loading ? <p className="muted">Loading…</p> : null}

        <div className="panel" style={{ padding: "0.85rem 1rem" }}>
          <strong style={{ display: "block", marginBottom: "0.5rem" }}>
            Portal users for this client
          </strong>
          {portalUsers.length === 0 ? (
            <p className="muted" style={{ margin: "0 0 0.75rem", fontSize: "0.85rem" }}>
              No portal login for this client yet.
            </p>
          ) : (
            <ul style={{ margin: "0 0 0.75rem", paddingLeft: "1.1rem" }}>
              {portalUsers.map((u) => (
                <li key={u.id} style={{ marginBottom: "0.35rem" }}>
                  {u.fullName} ({u.email})
                  {u.hasPassword ? "" : " · magic-link only"}
                  {u.lastLoginAt ? ` · last login ${formatDateTime(u.lastLoginAt)}` : ""}
                </li>
              ))}
            </ul>
          )}

          <form
            onSubmit={(e) => void invite(e)}
            style={{ display: "grid", gap: "0.5rem", maxWidth: "28rem" }}
          >
            <label>
              Invite email
              <input
                className="search-input"
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                disabled={busy}
              />
            </label>
            <label>
              Display name
              <input
                className="search-input"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                disabled={busy}
              />
            </label>
            <label>
              Temporary password (optional, min 10 chars)
              <input
                className="search-input"
                type="password"
                value={invitePassword}
                onChange={(e) => setInvitePassword(e.target.value)}
                disabled={busy}
                autoComplete="new-password"
              />
            </label>
            <Button type="submit" size="sm" disabled={busy}>
              Invite / update portal user
            </Button>
          </form>
        </div>

        <div className="panel" style={{ padding: "0.85rem 1rem" }}>
          <div
            style={{
              display: "flex",
              gap: "0.75rem",
              flexWrap: "wrap",
              alignItems: "center",
              marginBottom: "0.65rem",
            }}
          >
            <strong>Matter on portal</strong>
            {matterShares.length > 0 ? (
              <Badge tone="open">Shared</Badge>
            ) : (
              <Badge tone="pending">Not shared</Badge>
            )}
            <Button size="sm" disabled={busy} onClick={() => void shareMatter()}>
              Share matter to portal
            </Button>
          </div>
          <label
            style={{
              display: "flex",
              gap: "0.45rem",
              alignItems: "center",
              marginBottom: "0.65rem",
              fontSize: "0.85rem",
            }}
          >
            <input
              type="checkbox"
              checked={allowUpload}
              onChange={(e) => setAllowUpload(e.target.checked)}
              disabled={busy}
            />
            Allow client uploads to inbox (quarantine; not auto-published)
          </label>
          {matterShares.length === 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
              Client cannot see this matter until you share it.
            </p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
              {matterShares.map((s) => (
                <li key={s.id} style={{ marginBottom: "0.4rem" }}>
                  Active since {formatDateTime(s.sharedAt)} ({s.permission}){" "}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void revokeShare("matter", s.id)}
                  >
                    Revoke
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="panel" style={{ padding: "0.85rem 1rem" }}>
          <strong style={{ display: "block", marginBottom: "0.5rem" }}>
            Documents on portal
          </strong>
          <p className="muted" style={{ fontSize: "0.85rem", marginTop: 0 }}>
            Sharing the matter does not auto-share files. Share each document explicitly.
          </p>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
            <select
              className="filter-select"
              value={shareDocId}
              onChange={(e) => setShareDocId(e.target.value)}
              disabled={busy || docs.length === 0}
              aria-label="Document to share"
            >
              <option value="">Select document…</option>
              {docs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
            <Button size="sm" disabled={busy || !shareDocId} onClick={() => void shareDocument()}>
              Share document
            </Button>
          </div>
          {docShares.length === 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
              No documents shared to the portal for this matter.
            </p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
              {docShares.map((s) => (
                <li key={s.id} style={{ marginBottom: "0.4rem" }}>
                  {s.documentTitle} ({s.fileName}){" "}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void revokeShare("document", s.id)}
                  >
                    Revoke
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="panel" style={{ padding: "0.85rem 1rem" }}>
          <strong style={{ display: "block", marginBottom: "0.5rem" }}>
            Portal upload inbox
          </strong>
          <p className="muted" style={{ fontSize: "0.85rem", marginTop: 0 }}>
            {virusNote ??
              "Client uploads stay here until you accept them into matter documents."}
          </p>
          {inbox.length === 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
              No pending portal uploads.
            </p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
              {inbox.map((item) => (
                <li key={item.id} style={{ marginBottom: "0.45rem" }}>
                  {item.title} ({item.fileName}) · {formatDateTime(item.createdAt)}{" "}
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => void reviewInbox(item.id, "accept")}
                  >
                    Accept
                  </Button>{" "}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void reviewInbox(item.id, "dismiss")}
                  >
                    Dismiss
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="panel" style={{ padding: "0.85rem 1rem" }}>
          <strong style={{ display: "block", marginBottom: "0.5rem" }}>
            Recent portal activity
          </strong>
          {activity.length === 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
              No portal share or download events for this matter yet.
            </p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: "1.1rem", fontSize: "0.85rem" }}>
              {activity.slice(0, 20).map((a) => (
                <li key={a.id} style={{ marginBottom: "0.3rem" }}>
                  {actionLabel(a.action)} · {formatDateTime(a.createdAt)}
                  {typeof a.metadata.fileName === "string"
                    ? ` · ${a.metadata.fileName}`
                    : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Can>
  );
}
