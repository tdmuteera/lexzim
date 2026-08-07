"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { Icon } from "@/components/ui/Icon";
import { getFirmBranding } from "@/lib/firm/branding";
import { filterNavSections } from "@/lib/nav";
import { useUiStore } from "@/lib/store";

export function AppSidebar() {
  const pathname = usePathname();
  const { user, can, isLoading } = useAuth();
  const branding = getFirmBranding(user);
  const visibleSections = isLoading ? [] : filterNavSections(can);
  const { sidebarCollapsed, mobileNavOpen, setMobileNavOpen } = useUiStore();

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
        {isLoading ? (
          <div className="muted" style={{ padding: "1rem 0.75rem", fontSize: "0.85rem" }}>
            Loading menu…
          </div>
        ) : (
          visibleSections.map((section) => (
            <div key={section.title}>
              <div className="nav-section">{section.title}</div>
              {section.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={["nav-item", active ? "active" : ""].filter(Boolean).join(" ")}
                    onClick={() => setMobileNavOpen(false)}
                  >
                    <Icon name={item.icon} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))
        )}
      </nav>

      <div className="sidebar-foot">
        <strong>{branding.displayName}</strong>
        {branding.platformName} · {branding.isDemo ? "Demo tenant" : "Multi-tenant SaaS"}
      </div>
    </aside>
  );
}
