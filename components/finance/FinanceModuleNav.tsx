"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { FINANCE_TABS, filterModuleTabs, isModuleTabActive } from "@/lib/module-nav";

export function FinanceModuleNav() {
  const pathname = usePathname();
  const { can } = useAuth();
  const tabs = filterModuleTabs(FINANCE_TABS, can);

  if (tabs.length === 0) return null;

  return (
    <nav className="tabs module-tabs" aria-label="Finance sections">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          prefetch
          className={["tab", isModuleTabActive(pathname, tab) ? "active" : ""]
            .filter(Boolean)
            .join(" ")}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
