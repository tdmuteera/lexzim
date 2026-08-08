import { NextResponse } from "next/server";
import { getAppPublicUrl, getPublicSupabaseConfig } from "@/lib/env";
import { isPortalEnabled } from "@/lib/portal/config";
import { APP_VERSION } from "@/lib/release/version";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — Railway healthcheck + local readiness.
 * Returns 503 when required runtime env is missing (does not expose secrets).
 * AUTH_SECRET is reported but not required (auth is Supabase session cookies).
 */
export async function GET() {
  const supabase = getPublicSupabaseConfig();
  const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
  const hasServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const hasAuthSecret = Boolean(process.env.AUTH_SECRET);
  const appUrl = getAppPublicUrl();
  const railwayEnv = process.env.RAILWAY_ENVIRONMENT_NAME?.trim() || null;

  const ready =
    supabase.isConfigured && hasDatabaseUrl && hasServiceRole;

  const body = {
    ok: ready,
    service: "lexzim",
    version: APP_VERSION,
    environment: railwayEnv,
    timestamp: new Date().toISOString(),
    portal: {
      enabled: isPortalEnabled(),
      path: "/portal",
      health: "/api/portal/health",
    },
    env: {
      supabaseUrl: supabase.isConfigured,
      databaseUrl: hasDatabaseUrl,
      serviceRole: hasServiceRole,
      authSecret: hasAuthSecret,
      appUrl: Boolean(appUrl),
      appUrlHttps: appUrl.startsWith("https://"),
      configured: ready,
    },
  };

  return NextResponse.json(body, {
    status: ready ? 200 : 503,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
