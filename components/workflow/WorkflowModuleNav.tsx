"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WORKFLOW_TABS, isModuleTabActive } from "@/lib/module-nav";

export function WorkflowModuleNav() {
  const pathname = usePathname();

  return (
    <nav className="tabs module-tabs" aria-label="Workflow sections">
      {WORKFLOW_TABS.map((tab) => (
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
