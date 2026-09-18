"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { AccessDenied } from "@/components/shell/AccessDenied";
import { getRoutePermission, getRoutePermissions } from "@/lib/nav";

/** Client-side route guard (hydration + client navigations). */
export function RouteGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { can, isLoading, user } = useAuth();
  const permissions = getRoutePermissions(pathname);
  const permission = getRoutePermission(pathname);

  // If we already have a session, do not block module paint on a background refresh.
  if (isLoading && !user) {
    return (
      <div className="muted" style={{ padding: "1.5rem" }}>
        Loading permissions…
      </div>
    );
  }

  if (permissions.length && !permissions.some((code) => can(code))) {
    return <AccessDenied permission={permission} />;
  }

  return children;
}
