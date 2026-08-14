"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/finance/accounting/accounts", label: "Chart of accounts" },
  { href: "/finance/accounting/journals", label: "Journal entries" },
  { href: "/finance/accounting/trial-balance", label: "Trial balance" },
  { href: "/finance/accounting/statements", label: "Financial statements" },
];

export function AccountingSubNav() {
  const pathname = usePathname();

  return (
    <nav className="tabs accounting-sub-tabs" aria-label="Accounting sections">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          prefetch
          className={[
            "tab",
            pathname === tab.href || pathname.startsWith(`${tab.href}/`) ? "active" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
