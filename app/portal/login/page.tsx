import { Suspense } from "react";
import { PortalLoginForm } from "@/components/portal/PortalLoginForm";
import { isPortalEnabled } from "@/lib/portal/config";

export default function PortalLoginPage() {
  if (!isPortalEnabled()) return null;

  return (
    <Suspense fallback={<p className="muted">Loading sign-in…</p>}>
      <PortalLoginForm />
    </Suspense>
  );
}
