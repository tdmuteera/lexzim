import { NextResponse } from "next/server";
import {
  getPortalPublicPath,
  getPortalStrategyNote,
  isPortalEnabled,
} from "@/lib/portal/config";
import { APP_VERSION } from "@/lib/release/version";

export const dynamic = "force-dynamic";

/**
 * GET /api/portal/health — portal skeleton readiness (P5-02).
 * Does not imply sharing or portal auth are live.
 */
export async function GET() {
  const enabled = isPortalEnabled();
  const body = {
    ok: true,
    service: "lexzim-portal",
    version: APP_VERSION,
    portalEnabled: enabled,
    path: getPortalPublicPath(),
    strategy: getPortalStrategyNote(),
    portalAuthEnabled: enabled,
    sharingEnabled: true,
    sharingApiReady: true,
    sessionCookie: "lz_portal_session",
    sessionTtlHours: 8,
    timestamp: new Date().toISOString(),
    note: enabled
      ? "Portal auth, limited shared UI, and download API ready. Staff share UX is P5-06. Default remains share-nothing until a lawyer shares."
      : "Portal UI disabled (PORTAL_ENABLED=0). Staff app is unaffected.",
  };

  return NextResponse.json(body, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
