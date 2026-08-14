"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { Icon } from "@/components/ui/Icon";
import { GlobalSearch } from "@/components/shell/GlobalSearch";
import type { ReminderItem, RemindersPayload } from "@/components/reminders/RemindersCenter";
import { getPageSubtitle, getRouteMeta } from "@/lib/nav";
import { toTopbarUser, useUiStore } from "@/lib/store";

function formatShort(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AppTopbar() {
  const router = useRouter();
  const pathname = usePathname();
  const meta = getRouteMeta(pathname);
  const { user: session, isLoading, refresh, can } = useAuth();
  const user = session ? toTopbarUser(session) : null;
  const pageSubtitle = getPageSubtitle(pathname, user?.firmName);
  const { sidebarCollapsed, toggleSidebarCollapsed, toggleMobileNav, setMobileNavOpen } =
    useUiStore();

  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [preview, setPreview] = useState<ReminderItem[]>([]);
  const [total, setTotal] = useState(0);
  const [alerts, setAlerts] = useState<
    { id: string; title: string; body: string | null; href: string | null; createdAt: string }[]
  >([]);
  const [alertUnread, setAlertUnread] = useState(0);
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const loadPreview = useCallback(async () => {
    if (!can("calendar.view")) {
      setPreview([]);
      setTotal(0);
    } else {
      try {
        const res = await fetch("/api/reminders", { credentials: "include" });
        const body = (await res.json()) as {
          ok: boolean;
          data?: RemindersPayload;
        };
        if (res.ok && body.ok && body.data) {
          const items = [
            ...body.data.overdue,
            ...body.data.dueSoon,
            ...body.data.hearings,
          ].slice(0, 6);
          setPreview(items);
          setTotal(body.data.counts.total);
        }
      } catch {
        /* ignore */
      }
    }

    if (!can("matters.view")) {
      setAlerts([]);
      setAlertUnread(0);
      return;
    }
    try {
      const res = await fetch("/api/notifications?unreadOnly=1", {
        credentials: "include",
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: {
          items: {
            id: string;
            title: string;
            body: string | null;
            href: string | null;
            createdAt: string;
          }[];
          unreadCount: number;
        };
      };
      if (!res.ok || !body.ok || !body.data) return;
      setAlerts(body.data.items.slice(0, 6));
      setAlertUnread(body.data.unreadCount);
    } catch {
      /* ignore */
    }
  }, [can]);

  useEffect(() => {
    if (isLoading) return;
    void loadPreview();
    const id = window.setInterval(() => void loadPreview(), 120_000);
    return () => window.clearInterval(id);
  }, [isLoading, loadPreview]);

  useEffect(() => {
    function onDocPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (notifRef.current && !notifRef.current.contains(target)) setNotifOpen(false);
      if (profileRef.current && !profileRef.current.contains(target)) setProfileOpen(false);
    }
    // pointerdown (not mousedown) so menu item clicks are not raced away
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, []);

  function onMenuToggle() {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches) {
      toggleMobileNav();
    } else {
      toggleSidebarCollapsed();
      setMobileNavOpen(false);
    }
  }

  function goProfileLink(href: string) {
    setProfileOpen(false);
    router.push(href);
  }

  async function onLogout() {
    setProfileOpen(false);
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 5000);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
        signal: ctrl.signal,
      });
    } catch {
      /* timeout / network: still clear client session and leave */
    } finally {
      window.clearTimeout(timer);
    }
    try {
      await refresh();
    } catch {
      /* ignore */
    }
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button
          type="button"
          className="menu-toggle"
          aria-label={sidebarCollapsed ? "Expand menu" : "Collapse menu"}
          onClick={onMenuToggle}
        >
          <Icon name="menu" />
        </button>
        <div className="page-title-wrap">
          <div className="page-title">{meta.title}</div>
          <div className="page-subtitle">{pageSubtitle}</div>
        </div>
      </div>

      <div className="topbar-right">
        <GlobalSearch />

        <div style={{ position: "relative" }} ref={notifRef}>
          <button
            type="button"
            className="icon-btn"
            aria-label="Reminders"
            onClick={() => {
              setNotifOpen((v) => !v);
              setProfileOpen(false);
              if (!notifOpen) void loadPreview();
            }}
          >
            <Icon name="bell" />
            {total + alertUnread > 0 ? <span className="badge-dot" /> : null}
          </button>
          <div className={["dropdown", notifOpen ? "open" : ""].filter(Boolean).join(" ")}>
            <div className="dropdown-head">
              <strong>Alerts</strong>
              <Link
                href="/reminders"
                className="btn btn-ghost btn-sm"
                onClick={() => setNotifOpen(false)}
              >
                Reminders
              </Link>
            </div>
            <div className="dropdown-list">
              {alerts.length > 0 ? (
                <>
                  {alerts.map((item) => (
                    <Link
                      key={item.id}
                      href={item.href || "/matters"}
                      className="dropdown-item"
                      onClick={() => {
                        setNotifOpen(false);
                        void fetch("/api/notifications", {
                          method: "POST",
                          credentials: "include",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ notificationId: item.id }),
                        }).then(() => loadPreview());
                      }}
                      style={{
                        display: "block",
                        padding: "0.65rem 1rem",
                        textDecoration: "none",
                        color: "inherit",
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      <div style={{ fontSize: "0.82rem", fontWeight: 600 }}>{item.title}</div>
                      <div className="muted" style={{ fontSize: "0.72rem" }}>
                        {item.body ? `${item.body} · ` : ""}
                        {formatShort(item.createdAt)}
                      </div>
                    </Link>
                  ))}
                </>
              ) : null}
              {!can("calendar.view") && alerts.length === 0 ? (
                <div className="muted" style={{ padding: "1rem" }}>
                  No alerts.
                </div>
              ) : can("calendar.view") && preview.length === 0 && alerts.length === 0 ? (
                <div className="muted" style={{ padding: "1rem" }}>
                  Nothing due right now.
                </div>
              ) : (
                preview.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="dropdown-item"
                    onClick={() => setNotifOpen(false)}
                    style={{
                      display: "block",
                      padding: "0.65rem 1rem",
                      textDecoration: "none",
                      color: "inherit",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <div style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                      {item.isOverdue ? "Overdue · " : ""}
                      {item.title}
                    </div>
                    <div className="muted" style={{ fontSize: "0.72rem" }}>
                      {formatShort(item.dueAt)}
                      {item.matterTitle ? ` · ${item.matterTitle}` : ""}
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>

        <div style={{ position: "relative" }} ref={profileRef}>
          <button
            type="button"
            className="user-chip"
            aria-label="User menu"
            onClick={() => {
              setProfileOpen((v) => !v);
              setNotifOpen(false);
            }}
          >
            <div className="user-avatar">{isLoading ? "…" : (user?.initials ?? "—")}</div>
            <div className="user-meta">
              <strong>{isLoading ? "Loading…" : (user?.fullName ?? "Signed out")}</strong>
              <span>
                {isLoading
                  ? ""
                  : user
                    ? `${user.roleName} · ${user.firmName}`
                    : "No session"}
              </span>
            </div>
            <Icon
              name="chevron"
              style={{ width: "0.7rem", color: "var(--text-3)", marginRight: "0.25rem" }}
            />
          </button>
          <div
            className={["dropdown", "profile-menu", profileOpen ? "open" : ""]
              .filter(Boolean)
              .join(" ")}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => goProfileLink("/settings")}
              title="Firm profile, AI, backup, and about"
            >
              <Icon name="user" /> Account &amp; profile
            </button>
            <button
              type="button"
              onClick={() => goProfileLink(can("users.manage") ? "/staff" : "/settings")}
              title="Staff seats, roles, and sessions"
            >
              <Icon name="shield" /> Security &amp; roles
            </button>
            <button
              type="button"
              onClick={() => goProfileLink(can("audit.view") ? "/audit" : "/help")}
              title="Audit activity"
            >
              <Icon name="list" /> Activity log
            </button>
            <button type="button" className="danger" onClick={() => void onLogout()}>
              <Icon name="logout" /> Sign out
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
