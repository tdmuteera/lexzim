import { jsonError, jsonOk } from "@/lib/auth/http";
import { requirePlatformAdmin } from "@/lib/platform/admin";
import { getDb } from "@/lib/db";
import { firms } from "@/lib/db/schema";

/** Platform admin probe (P0-08+ tenant architecture). Full dashboard UI is later. */
export async function GET() {
  try {
    const admin = await requirePlatformAdmin();
    const db = getDb();
    const tenantRows = await db
      .select({
        id: firms.id,
        name: firms.name,
        slug: firms.slug,
        status: firms.status,
        isDemo: firms.isDemo,
      })
      .from(firms)
      .orderBy(firms.name);

    return jsonOk({
      admin,
      tenants: tenantRows,
    });
  } catch (err) {
    return jsonError(err);
  }
}
