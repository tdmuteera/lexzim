import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { AppShell } from "@/components/shell/AppShell";
import { authHasCookieSession } from "@/lib/auth/session";

/**
 * Platform chrome only. JWT/cookie gate (no Postgres) so soft navigations
 * between modules are not blocked on connect_timeout / firm-count queries.
 * Full session + RBAC still enforced by RouteGuard and /api/* handlers.
 */
export default async function PlatformLayout({ children }: { children: ReactNode }) {
  try {
    if (!(await authHasCookieSession())) {
      redirect("/login");
    }
    return <AppShell>{children}</AppShell>;
  } catch (err) {
    if (isRedirectError(err)) throw err;
    throw err;
  }
}
