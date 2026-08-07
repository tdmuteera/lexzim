"use client";

import type { ReactNode } from "react";
import { useAuth } from "@/components/auth/AuthProvider";

type CanProps = {
  permission?: string;
  permissions?: string[];
  mode?: "any" | "all";
  children: ReactNode;
  fallback?: ReactNode;
};

/**
 * Renders children when the current user has the required permission(s).
 */
export function Can({
  permission,
  permissions,
  mode = "all",
  children,
  fallback = null,
}: CanProps) {
  const { can, canAny, canAll, isLoading } = useAuth();

  if (isLoading) return fallback;

  let allowed = false;
  if (permission) {
    allowed = can(permission);
  } else if (permissions?.length) {
    allowed = mode === "any" ? canAny(permissions) : canAll(permissions);
  }

  return allowed ? children : fallback;
}
