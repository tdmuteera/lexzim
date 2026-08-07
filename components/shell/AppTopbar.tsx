"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { Icon } from "@/components/ui/Icon";
import { GlobalSearch } from "@/components/shell/GlobalSearch";
import { getRouteMeta } from "@/lib/nav";
import { toTopbarUser, useUiStore } from "@/lib/store";

export function AppTopbar() {
  const router = useRouter();
  const pathname = usePathname();
  const meta = getRouteMeta(pathname);
  const { user: session, isLoading, refresh } = useAuth();
  const user = session ? toTopbarUser(session) : null;
  const { sidebarCollapsed, toggleSidebarCollapsed, toggleMobileNav, setMobileNavOpen } =
    useUiStore();

  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (notifRef.current && !notifRef.current.contains(target)) setNotifOpen(false);
      if (profileRef.current && !profileRef.current.contains(target)) setProfileOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function onMenuToggle() {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches) {
      toggleMobileNav();
    } else {
      toggleSidebarCollapsed();
      setMobileNavOpen(false);
    }
  }

  async function onLogout() {
    setProfileOpen(false);
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } finally {
      await refresh();
      router.replace("/login");
      router.refresh();
    }
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
          <div className="page-subtitle">{meta.subtitle}</div>
        </div>
      </div>

      <div className="topbar-right">
        <GlobalSearch />

        <div style={{ position: "relative" }} ref={notifRef}>
          <button
            type="button"
            className="icon-btn"
            aria-label="Notifications"
            onClick={() => {
              setNotifOpen((v) => !v);
              setProfileOpen(false);
            }}
          >
            <Icon name="bell" />
            <span className="badge-dot" />
          </button>
          <div className={["dropdown", notifOpen ? "open" : ""].filter(Boolean).join(" ")}>
            <div className="dropdown-head">
              <strong>Notifications</strong>
              <button type="button" className="btn btn-ghost btn-sm">
                Mark all read
              </button>
            </div>
            <div className="dropdown-list">
              <div className="muted" style={{ padding: "1rem" }}>
                Notifications placeholder · Phase 1+
              </div>
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
          >
            <button type="button" disabled title="Account settings in a later phase">
              <Icon name="user" /> Account &amp; profile
            </button>
            <button type="button" disabled title="Security settings in a later phase">
              <Icon name="shield" /> Security &amp; roles
            </button>
            <button type="button" disabled title="Activity log in app sidebar">
              <Icon name="list" /> Activity log
            </button>
            <button type="button" className="danger" onClick={onLogout}>
              <Icon name="logout" /> Sign out
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
