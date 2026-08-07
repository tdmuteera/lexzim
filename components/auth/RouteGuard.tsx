"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { AccessDenied } from "@/components/shell/AccessDenied";
import { getRoutePermission } from "@/lib/nav";

/** Client-side route guard (hydration + client navigations). */
export function RouteGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { can, isLoading } = useAuth();
  const permission = getRoutePermission(pathname);

  if (isLoading) {
    return (
      <div className="muted" style={{ padding: "1.5rem" }}>
        Loading permissions…
      </div>
    );
  }

  if (permission && !can(permission)) {
    return <AccessDenied permission={permission} />;
  }

  return children;
}
