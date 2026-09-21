import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { AppShell } from "@/components/shell/AppShell";
import { authCookieSessionGate } from "@/lib/auth/session";

/**
 * Platform chrome. Cookie + staff idle/absolute session gate on hard entry
 * (bookmark, paste URL, refresh). Soft navigations keep this layout mounted.
 * Full RBAC still enforced by RouteGuard and /api/* handlers.
 */
export default async function PlatformLayout({ children }: { children: ReactNode }) {
  try {
    const gate = await authCookieSessionGate();
    if (!gate.ok) {
      redirect(gate.reason ? `/login?reason=${gate.reason}` : "/login");
    }
    return <AppShell>{children}</AppShell>;
  } catch (err) {
    if (isRedirectError(err)) throw err;
    throw err;
  }
}
