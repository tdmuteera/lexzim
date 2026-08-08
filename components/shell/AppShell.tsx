"use client";

import type { ReactNode } from "react";
import { RouteGuard } from "@/components/auth/RouteGuard";
import { BrowserNotifications } from "@/components/reminders/BrowserNotifications";
import { AppSidebar } from "@/components/shell/AppSidebar";
import { AppTopbar } from "@/components/shell/AppTopbar";
import { ToastProvider } from "@/components/ui/Toast";
import { useUiStore } from "@/lib/store";

export function AppShell({ children }: { children: ReactNode }) {
  const { mobileNavOpen, setMobileNavOpen } = useUiStore();

  return (
    <ToastProvider>
      <div id="app-shell" className="active" aria-label="LexZim Platform">
        <BrowserNotifications />
        <div
          className={["sidebar-backdrop", mobileNavOpen ? "open" : ""]
            .filter(Boolean)
            .join(" ")}
          id="sidebar-backdrop"
          onClick={() => setMobileNavOpen(false)}
          aria-hidden="true"
        />
        <AppSidebar />
        <div className="main">
          <AppTopbar />
          <div className="content">
            <RouteGuard>{children}</RouteGuard>
          </div>
        </div>
      </div>
    </ToastProvider>
  );
}
