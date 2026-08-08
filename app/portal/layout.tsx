import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PortalShell } from "@/components/portal/PortalShell";
import { isPortalEnabled } from "@/lib/portal/config";
import "@/styles/portal.css";

export const metadata: Metadata = {
  title: "LexZim Client Portal",
  description: "Limited client access to shared matters and documents.",
};

export default function PortalLayout({ children }: { children: ReactNode }) {
  if (!isPortalEnabled()) {
    return (
      <div className="portal-shell portal-disabled">
        <main className="portal-main">
          <h1>Client portal unavailable</h1>
          <p>
            The LexZim client portal is disabled on this deployment. Firm staff continue to use the
            main app as usual.
          </p>
          <p>
            Ops: set <code>PORTAL_ENABLED=1</code> to enable the skeleton (see{" "}
            <code>docs/cloud/DEV_SETUP_PORTAL.md</code>).
          </p>
        </main>
      </div>
    );
  }

  return <PortalShell>{children}</PortalShell>;
}
