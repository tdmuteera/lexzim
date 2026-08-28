"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { Icon } from "@/components/ui/Icon";
import type { NavIcon } from "@/lib/nav";
import { useUiStore } from "@/lib/store";

type BottomSlot = {
  id: string;
  label: string;
  href?: string;
  icon: NavIcon;
  permission?: string;
  more?: boolean;
};

const SLOTS: BottomSlot[] = [
  { id: "home", label: "Home", href: "/dashboard", icon: "dashboard", permission: "dashboard.view" },
  { id: "tasks", label: "Tasks", href: "/workflow/tasks", icon: "check", permission: "dashboard.view" },
  { id: "ai", label: "AI", href: "/ai", icon: "robot", permission: "ai.use" },
  { id: "calendar", label: "Calendar", href: "/calendar", icon: "calendar", permission: "calendar.view" },
  { id: "more", label: "More", icon: "menu", more: true },
];

function slotActive(pathname: string, href?: string) {
  if (!href) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Mobile-only primary nav. Full module list stays in the drawer (More). */
export function MobileBottomNav() {
  const pathname = usePathname();
  const { can, isLoading, user } = useAuth();
  const { mobileNavOpen, setMobileNavOpen, toggleMobileNav } = useUiStore();

  if (isLoading && !user) return null;

  const visible = SLOTS.filter((slot) => !slot.permission || can(slot.permission) || slot.more);

  return (
    <nav className="mobile-bottom-nav" aria-label="Primary mobile">
      {visible.map((slot) => {
        if (slot.more) {
          return (
            <button
              key={slot.id}
              type="button"
              className={["mobile-bottom-item", mobileNavOpen ? "active" : ""]
                .filter(Boolean)
                .join(" ")}
              aria-label="Open full menu"
              aria-expanded={mobileNavOpen}
              onClick={() => toggleMobileNav()}
            >
              <Icon name={slot.icon} />
              <span>{slot.label}</span>
            </button>
          );
        }
        const active = slotActive(pathname, slot.href);
        return (
          <Link
            key={slot.id}
            href={slot.href!}
            className={["mobile-bottom-item", active ? "active" : ""]
              .filter(Boolean)
              .join(" ")}
            onClick={() => setMobileNavOpen(false)}
          >
            <Icon name={slot.icon} />
            <span>{slot.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
