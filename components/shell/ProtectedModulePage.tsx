import type { ReactNode } from "react";
import { AccessDenied } from "@/components/shell/AccessDenied";
import { PlaceholderPage } from "@/components/shell/PlaceholderPage";
import { getRouteAccessStatus } from "@/lib/rbac/route-access";
import { getRouteMeta } from "@/lib/nav";

type ProtectedModulePageProps = {
  path: string;
  children?: ReactNode;
};

/**
 * Server route guard for placeholder-only modules.
 * When `children` is provided (client module views), skip the duplicate DB
 * session round-trip — AppShell RouteGuard + API requirePermission still enforce access.
 */
export async function ProtectedModulePage({ path, children }: ProtectedModulePageProps) {
  if (children) {
    return children;
  }

  const access = await getRouteAccessStatus(path);
  if (!access.allowed) {
    return <AccessDenied permission={access.permission} />;
  }

  return <PlaceholderPage meta={getRouteMeta(path)} />;
}
