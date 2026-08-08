import { eq } from "drizzle-orm";
import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { getDb } from "@/lib/db";
import { firms } from "@/lib/db/schema";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

/**
 * Firm MP: soft-deactivate (suspend) own firm with typed slug confirmation.
 * POST { confirmSlug, notes? }
 */
export async function POST(request: Request) {
  try {
    const session = await requirePermission("settings.manage");
    const firmId = tenantFirmId(session);
    const body = (await request.json()) as {
      confirmSlug?: string;
      notes?: string;
    };
    const db = getDb();
    const rows = await db.select().from(firms).where(eq(firms.id, firmId)).limit(1);
    const firm = rows[0];
    if (!firm) throw new AuthError("not_found", "Firm not found.");

    if ((body.confirmSlug ?? "").trim() !== firm.slug) {
      throw new AuthError(
        "validation",
        "Type your firm slug exactly to confirm deactivation.",
      );
    }

    const [updated] = await db
      .update(firms)
      .set({ status: "suspended", updatedAt: new Date() })
      .where(eq(firms.id, firmId))
      .returning();

    await writeAuditLog({
      action: "firm.deactivate_requested",
      firmId,
      userId: session.id,
      entityType: "firm",
      entityId: firmId,
      metadata: { slug: firm.slug, notes: body.notes ?? null },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({
      firm: {
        id: updated.id,
        slug: updated.slug,
        status: updated.status,
      },
      message:
        "Firm suspended. Staff cannot sign in. Export data first if you have not. Hard delete is ops-only.",
    });
  } catch (err) {
    return jsonError(err);
  }
}
