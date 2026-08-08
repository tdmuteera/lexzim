/**
 * Privacy purge: hard-delete a firm tenant (ops only).
 */
import "server-only";

import { eq } from "drizzle-orm";
import { AuthError } from "@/lib/auth/types";
import { writeAuditLog } from "@/lib/auth/audit";
import { getDb } from "@/lib/db";
import { firms, users } from "@/lib/db/schema";
import { requirePlatformAdmin } from "@/lib/platform/admin";
import { deleteFirmStoragePrefix } from "@/lib/storage/firm-files";
import { createAdminClient } from "@/lib/supabase/admin";

export const PURGE_CONFIRM_PHRASE = "DELETE FIRM";

/**
 * Irreversible firm purge. Requires prior suspend/archive and typed confirmations.
 * Deletes Storage under firms/{id}/, Supabase Auth users for staff rows, then firm row (cascade).
 */
export async function platformPurgeFirm(input: {
  firmId: string;
  confirmSlug: string;
  confirmPhrase: string;
  ipOrUserAgent?: string | null;
}) {
  const admin = await requirePlatformAdmin();
  if (input.confirmPhrase.trim() !== PURGE_CONFIRM_PHRASE) {
    throw new AuthError(
      "validation",
      `confirmPhrase must be exactly "${PURGE_CONFIRM_PHRASE}".`,
    );
  }

  const db = getDb();
  const rows = await db.select().from(firms).where(eq(firms.id, input.firmId)).limit(1);
  const firm = rows[0];
  if (!firm) throw new AuthError("not_found", "Firm not found.");
  if (firm.slug !== input.confirmSlug.trim()) {
    throw new AuthError("validation", "confirmSlug does not match firm slug.");
  }
  if (firm.status !== "suspended" && firm.status !== "archived") {
    throw new AuthError(
      "validation",
      "Firm must be suspended or archived before purge. Export data first.",
    );
  }

  const staff = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.firmId, firm.id));

  await writeAuditLog({
    action: "platform.firm_purge_started",
    firmId: firm.id,
    userId: admin.id,
    entityType: "firm",
    entityId: firm.id,
    metadata: {
      slug: firm.slug,
      name: firm.name,
      staffCount: staff.length,
    },
    ipOrUserAgent: input.ipOrUserAgent ?? null,
  });

  let storageRemoved = 0;
  try {
    storageRemoved = await deleteFirmStoragePrefix(firm.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "storage purge failed";
    throw new AuthError("validation", `Storage purge failed: ${message}`);
  }

  const supabaseAdmin = createAdminClient();
  for (const u of staff) {
    await supabaseAdmin.auth.admin.deleteUser(u.id).catch(() => undefined);
  }

  await db.delete(firms).where(eq(firms.id, firm.id));

  // Firm-scoped audits cascade away; write a platform-scoped breadcrumb without firm_id.
  await writeAuditLog({
    action: "platform.firm_purged",
    firmId: null,
    userId: admin.id,
    entityType: "firm",
    entityId: firm.id,
    metadata: {
      slug: firm.slug,
      name: firm.name,
      storageRemoved,
      staffAuthDeleted: staff.length,
    },
    ipOrUserAgent: input.ipOrUserAgent ?? null,
  });

  return {
    firmId: firm.id,
    slug: firm.slug,
    storageRemoved,
    staffAuthDeleted: staff.length,
  };
}
