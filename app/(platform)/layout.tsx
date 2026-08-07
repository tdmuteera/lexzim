import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { authCurrentUser, authNeedsSetup } from "@/lib/auth/service";

export default async function PlatformLayout({ children }: { children: ReactNode }) {
  if (await authNeedsSetup()) {
    redirect("/setup");
  }

  const user = await authCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return <AppShell>{children}</AppShell>;
}
