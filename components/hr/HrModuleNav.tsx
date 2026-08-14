"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { HR_TABS, filterModuleTabs, isModuleTabActive } from "@/lib/module-nav";

export function HrModuleNav() {
  const pathname = usePathname();
  const { can } = useAuth();
  const tabs = filterModuleTabs(HR_TABS, can);

  if (tabs.length === 0) return null;

  return (
    <nav className="tabs module-tabs" aria-label="HR sections">
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
