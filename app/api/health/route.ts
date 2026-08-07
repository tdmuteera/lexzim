import { NextResponse } from "next/server";
import { getPublicSupabaseConfig } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — liveness for Railway and local checks.
 * Does not expose secrets.
 */
export async function GET() {
  const supabase = getPublicSupabaseConfig();
  const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
  const hasServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const hasAuthSecret = Boolean(process.env.AUTH_SECRET);

  const configured =
    supabase.isConfigured && hasDatabaseUrl && hasServiceRole && hasAuthSecret;

  return NextResponse.json({
    ok: true,
    service: "lexzim",
    timestamp: new Date().toISOString(),
    env: {
      supabaseUrl: supabase.isConfigured,
      databaseUrl: hasDatabaseUrl,
      serviceRole: hasServiceRole,
      authSecret: hasAuthSecret,
      configured,
    },
  });
}
