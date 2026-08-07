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
 * Server route guard + placeholder shell for Phase 0 modules.
 */
export async function ProtectedModulePage({ path, children }: ProtectedModulePageProps) {
  const access = await getRouteAccessStatus(path);
  if (!access.allowed) {
    return <AccessDenied permission={access.permission} />;
  }

  if (children) {
    return children;
  }

  return <PlaceholderPage meta={getRouteMeta(path)} />;
}
