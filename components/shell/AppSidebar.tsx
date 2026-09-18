"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

  /** Firm-wide pins: stay expanded for everyone. */
  const [pinnedSections, setPinnedSections] = useState<string[]>([]);
  const [canEditPins, setCanEditPins] = useState(false);
  const [pinBusy, setPinBusy] = useState<string | null>(null);

  /** Session-only opens: expand on click until collapsed again (not persisted). */
  const [sessionOpen, setSessionOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/settings/nav-pins", { credentials: "include" });
        const body = (await res.json()) as {
          ok?: boolean;
          data?: { pinnedSections?: string[]; canEdit?: boolean };
        };
        if (cancelled || !res.ok || !body.ok) return;
        setPinnedSections(body.data?.pinnedSections ?? []);
        setCanEditPins(Boolean(body.data?.canEdit));
      } catch {
        /* keep defaults: all collapsed */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Fresh login / user change: start with modules collapsed (pins still open).
  useEffect(() => {
    setSessionOpen({});
  }, [user?.id]);

  const pinnedSet = useMemo(() => new Set(pinnedSections), [pinnedSections]);

  const togglePin = useCallback(
    async (title: string, currentlyPinned: boolean) => {
      if (!canEditPins || pinBusy) return;
      setPinBusy(title);
      try {
        const res = await fetch("/api/settings/nav-pins", {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ section: title, pinned: !currentlyPinned }),
        });
        const body = (await res.json()) as {
          ok?: boolean;
          data?: { pinnedSections?: string[] };
        };
        if (res.ok && body.ok && body.data?.pinnedSections) {
          setPinnedSections(body.data.pinnedSections);
          if (!currentlyPinned) {
            setSessionOpen((prev) => ({ ...prev, [title]: true }));
          }
        }
      } catch {
        /* ignore */
      } finally {
        setPinBusy(null);
      }
    },
    [canEditPins, pinBusy],
  );

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
            const isPinned = pinnedSet.has(section.title);
            const hasActiveChild = section.items.some((item) =>
              isNavItemActive(pathname, item.href),
            );
            // Default collapsed. Open if: firm pin, session expand, or current route (unless user closed it).
            const explicitlyClosed = sessionOpen[section.title] === false;
            const open =
              isPinned ||
              sessionOpen[section.title] === true ||
              (hasActiveChild && !explicitlyClosed);
            const isCollapsed = !sidebarCollapsed && !open;
            const showItems = !isCollapsed || sidebarCollapsed;

            return (
              <div
                key={section.title}
                className={["nav-section-block", isCollapsed ? "is-collapsed" : ""]
                  .filter(Boolean)
                  .join(" ")}
              >
                <div className="nav-section-row">
                  <button
                    type="button"
                    className={[
                      "nav-section",
                      "nav-section-toggle",
                      hasActiveChild ? "has-active" : "",
                      isPinned ? "is-pinned" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    aria-expanded={!isCollapsed}
                    onClick={() => {
                      if (isPinned) return;
                      if (open) {
                        setSessionOpen((prev) => ({ ...prev, [section.title]: false }));
                      } else {
                        setSessionOpen((prev) => ({ ...prev, [section.title]: true }));
                      }
                    }}
                    title={
                      isPinned
                        ? `${section.title} (pinned open for the firm)`
                        : open
                          ? `Collapse ${section.title}`
                          : `Expand ${section.title}`
                    }
                  >
                    <span>{section.title}</span>
                    <Icon
                      name="chevron"
                      className={isCollapsed ? "nav-section-chevron" : "nav-section-chevron open"}
                    />
                  </button>
                  {canEditPins ? (
                    <button
                      type="button"
                      className={[
                        "nav-section-pin",
                        isPinned ? "is-pinned" : "",
                        pinBusy === section.title ? "is-busy" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      aria-label={
                        isPinned
                          ? `Unpin ${section.title} for the firm`
                          : `Pin ${section.title} open for the firm`
                      }
                      title={
                        isPinned
                          ? "Unpin (firm-wide)"
                          : "Pin open for everyone in the firm"
                      }
                      disabled={pinBusy === section.title}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void togglePin(section.title, isPinned);
                      }}
                    >
                      <Icon name="pin" />
                    </button>
                  ) : isPinned ? (
                    <span
                      className="nav-section-pin is-pinned is-readonly"
                      title="Pinned open for the firm"
                      aria-hidden="true"
                    >
                      <Icon name="pin" />
                    </span>
                  ) : null}
                </div>
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
