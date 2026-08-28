"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { Icon } from "@/components/ui/Icon";
import { setModuleCache } from "@/lib/client/module-cache";
import { getFirmBranding } from "@/lib/firm/branding";
import { filterNavSections } from "@/lib/nav";
import { isModuleTabActive, FINANCE_TABS, HR_TABS } from "@/lib/module-nav";
import { useUiStore } from "@/lib/store";

const API_WARM: Record<string, string> = {
  "/dashboard": "/api/dashboard",
  "/reminders": "/api/reminders",
  "/matters": "/api/matters?bucket=open&includeLawyers=1",
  "/clients": "/api/clients",
};

const ALWAYS_OPEN_SECTIONS = new Set(["Overview"]);

function storageKey(userId: string) {
  return `lz_nav_sections_${userId}`;
}

function warmModule(href: string) {
  const api = API_WARM[href];
  if (!api) return;
  void (async () => {
    try {
      const res = await fetch(api, { credentials: "include" });
      if (!res.ok) return;
      const body = (await res.json()) as { ok?: boolean; data?: unknown };
      if (body.ok && body.data != null) {
        setModuleCache(`module:${api.split("?")[0]}`, body.data);
      }
    } catch {
      /* ignore warm failures */
    }
  })();
}

function isNavItemActive(pathname: string, href: string): boolean {
  if (pathname === href || pathname.startsWith(`${href}/`)) return true;

  const financeTab = FINANCE_TABS.find((tab) => tab.href === href);
  if (financeTab && isModuleTabActive(pathname, financeTab)) return true;

  const hrTab = HR_TABS.find((tab) => tab.href === href);
  if (hrTab && isModuleTabActive(pathname, hrTab)) return true;

  return false;
}

export function AppSidebar() {
  const pathname = usePathname();
  const { user, can, isLoading } = useAuth();
  const branding = getFirmBranding(user);
  const showMenu = Boolean(user) || !isLoading;
  const visibleSections = showMenu ? filterNavSections(can) : [];
  const { sidebarCollapsed, mobileNavOpen, setMobileNavOpen } = useUiStore();
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(
    {},
  );

  useEffect(() => {
    if (!user?.id || typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKey(user.id));
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, boolean>;
      if (parsed && typeof parsed === "object") setCollapsedSections(parsed);
    } catch {
      /* ignore */
    }
  }, [user?.id]);

  const persist = useCallback(
    (next: Record<string, boolean>) => {
      setCollapsedSections(next);
      if (!user?.id || typeof window === "undefined") return;
      try {
        window.localStorage.setItem(storageKey(user.id), JSON.stringify(next));
      } catch {
        /* ignore */
      }
    },
    [user?.id],
  );

  function toggleSection(title: string) {
    if (ALWAYS_OPEN_SECTIONS.has(title)) return;
    const next = { ...collapsedSections, [title]: !collapsedSections[title] };
    persist(next);
  }

  const sidebarClass = [
    "sidebar",
    sidebarCollapsed ? "collapsed" : "",
    mobileNavOpen ? "open" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <aside className={sidebarClass} id="sidebar" aria-label="Main navigation">
      <div className="sidebar-brand">
        <div className="sidebar-logo">{branding.logoInitials}</div>
        <div className="sidebar-brand-text">
          <strong>{branding.displayName}</strong>
          <span>{branding.tagline}</span>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Main">
        {!showMenu ? (
          <div className="muted" style={{ padding: "1rem 0.75rem", fontSize: "0.85rem" }}>
            Loading menu…
          </div>
        ) : (
          visibleSections.map((section) => {
            const lockedOpen = ALWAYS_OPEN_SECTIONS.has(section.title);
            const isCollapsed =
              !sidebarCollapsed &&
              !lockedOpen &&
              Boolean(collapsedSections[section.title]);
            const hasActiveChild = section.items.some((item) =>
              isNavItemActive(pathname, item.href),
            );
            const showItems = !isCollapsed || sidebarCollapsed;
            return (
              <div
                key={section.title}
                className={["nav-section-block", isCollapsed ? "is-collapsed" : ""]
                  .filter(Boolean)
                  .join(" ")}
              >
                {lockedOpen ? (
                  <div className="nav-section">{section.title}</div>
                ) : (
                  <button
                    type="button"
                    className={[
                      "nav-section",
                      "nav-section-toggle",
                      hasActiveChild ? "has-active" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    aria-expanded={!isCollapsed}
                    onClick={() => toggleSection(section.title)}
                  >
                    <span>{section.title}</span>
                    <Icon
                      name="chevron"
                      className={isCollapsed ? "nav-section-chevron" : "nav-section-chevron open"}
                    />
                  </button>
                )}
                {showItems
                  ? section.items.map((item) => {
                      const active = isNavItemActive(pathname, item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          prefetch
                          className={["nav-item", active ? "active" : ""]
                            .filter(Boolean)
                            .join(" ")}
                          onClick={() => setMobileNavOpen(false)}
                          onMouseEnter={() => warmModule(item.href)}
                          onFocus={() => warmModule(item.href)}
                        >
                          <Icon name={item.icon} />
                          <span>{item.label}</span>
                        </Link>
                      );
                    })
                  : null}
              </div>
            );
          })
        )}
      </nav>

      <div className="sidebar-foot">
        <strong>{branding.displayName}</strong>
        {branding.platformName} · {branding.isDemo ? "Demo tenant" : "Multi-tenant SaaS"}
      </div>
    </aside>
  );
}
