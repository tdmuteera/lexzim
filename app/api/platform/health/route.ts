import { count, eq, sql } from "drizzle-orm";
import { jsonError, jsonOk } from "@/lib/auth/http";
import { getDb } from "@/lib/db";
import { aiJobs, firmLicences, firms, users } from "@/lib/db/schema";
import { getPublicSupabaseConfig } from "@/lib/env";
import { requireOpsAccess } from "@/lib/platform/ops-guard";
import { isPortalEnabled } from "@/lib/portal/config";
import { APP_VERSION } from "@/lib/release/version";

/**
 * Aggregate ops health — no matter contents.
 * GET /api/platform/health
 */
export async function GET(request: Request) {
  try {
    await requireOpsAccess(request);
    const db = getDb();
    const supabase = getPublicSupabaseConfig();

    const [firmCounts, licenceRows, userCount, pendingJobs, runningJobs] =
      await Promise.all([
        db
          .select({ status: firms.status, n: count() })
          .from(firms)
          .groupBy(firms.status),
        db
          .select({
            status: firmLicences.status,
            edition: firmLicences.edition,
            n: count(),
          })
          .from(firmLicences)
          .groupBy(firmLicences.status, firmLicences.edition),
        db.select({ n: count() }).from(users).where(eq(users.isActive, true)),
        db
          .select({ n: count() })
          .from(aiJobs)
          .where(eq(aiJobs.status, "pending")),
        db
          .select({ n: count() })
          .from(aiJobs)
          .where(eq(aiJobs.status, "running")),
      ]);

    const expiredLicences = await db
      .select({ n: count() })
      .from(firmLicences)
      .where(
        sql`${firmLicences.status} = 'active' and ${firmLicences.expiresAt} is not null and ${firmLicences.expiresAt} < now()`,
      );

    return jsonOk({
      service: "lexzim-ops",
      version: APP_VERSION,
      timestamp: new Date().toISOString(),
      portalEnabled: isPortalEnabled(),
      env: {
        supabaseUrl: supabase.isConfigured,
        databaseUrl: Boolean(process.env.DATABASE_URL),
        serviceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
        opsIpAllowlist: Boolean(process.env.OPS_IP_ALLOWLIST?.trim()),
      },
      firmsByStatus: Object.fromEntries(
        firmCounts.map((r) => [r.status, Number(r.n)]),
      ),
      activeUsers: Number(userCount[0]?.n ?? 0),
      licences: licenceRows.map((r) => ({
        status: r.status,
        edition: r.edition,
        count: Number(r.n),
      })),
      licencesExpiredButMarkedActive: Number(expiredLicences[0]?.n ?? 0),
      aiJobs: {
        pending: Number(pendingJobs[0]?.n ?? 0),
        running: Number(runningJobs[0]?.n ?? 0),
      },
      note: "No matter, document, or client payloads included.",
    });
  } catch (err) {
    return jsonError(err);
  }
}
