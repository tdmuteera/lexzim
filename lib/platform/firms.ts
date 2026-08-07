import "server-only";

import { AuthError } from "@/lib/auth/types";
import { slugifyFirmName, validateEmail, validatePassword } from "@/lib/auth/password";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDb } from "@/lib/db";
import { firms, roles, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requirePlatformAdmin } from "@/lib/platform/admin";
import { writeAuditLog } from "@/lib/auth/audit";

export type CreateFirmTenantInput = {
  firmName: string;
  status?: "active" | "trial" | "demo";
  isDemo?: boolean;
  defaultCurrency?: string;
  managingPartner: {
    fullName: string;
    email: string;
    password: string;
  };
};

async function uniqueFirmSlug(base: string): Promise<string> {
  const db = getDb();
  let slug = base;
  let n = 0;
  for (;;) {
    const existing = await db.select({ id: firms.id }).from(firms).where(eq(firms.slug, slug)).limit(1);
    if (!existing[0]) return slug;
    n += 1;
    slug = `${base}-${n}`;
  }
}

/**
 * Register a new firm tenant on an existing platform (post-bootstrap).
 * Platform admin UI arrives later; this is the server foundation.
 */
export async function platformCreateFirm(
  input: CreateFirmTenantInput,
  opts?: { ipOrUserAgent?: string | null },
): Promise<{ firmId: string; userId: string; slug: string }> {
  const admin = await requirePlatformAdmin();

  const firmName = input.firmName.trim();
  if (!firmName) throw new AuthError("invalid_firm", "Firm name is required.");

  const email = validateEmail(input.managingPartner.email);
  validatePassword(input.managingPartner.password);
  const fullName = input.managingPartner.fullName.trim();
  if (!fullName) throw new AuthError("invalid_name", "Managing Partner name is required.");

  const db = getDb();
  const mpRows = await db
    .select()
    .from(roles)
    .where(eq(roles.code, "managing_partner"))
    .limit(1);
  const mpRole = mpRows[0];
  if (!mpRole) {
    throw new AuthError("roles_missing", "Managing Partner role not found.");
  }

  const slug = await uniqueFirmSlug(slugifyFirmName(firmName));
  const isDemo = input.isDemo ?? false;
  const status = input.status ?? (isDemo ? "demo" : "active");

  const supabaseAdmin = createAdminClient();
  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: input.managingPartner.password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (createError || !created.user) {
    throw new AuthError("setup_failed", "Could not create auth user for new firm.");
  }

  const authUserId = created.user.id;

  try {
    const [firm] = await db
      .insert(firms)
      .values({
        name: firmName,
        slug,
        status,
        isDemo,
        defaultCurrency: input.defaultCurrency?.trim() || "USD",
      })
      .returning();

    if (!firm) throw new Error("Firm insert failed");

    await db.insert(users).values({
      id: authUserId,
      firmId: firm.id,
      email,
      fullName,
      roleId: mpRole.id,
      isActive: true,
    });

    await writeAuditLog({
      action: "platform.firm_created",
      firmId: firm.id,
      userId: admin.id,
      entityType: "firm",
      entityId: firm.id,
      metadata: { firmName, slug, status, isDemo, mpEmail: email },
      ipOrUserAgent: opts?.ipOrUserAgent ?? null,
    });

    return { firmId: firm.id, userId: authUserId, slug };
  } catch (err) {
    await supabaseAdmin.auth.admin.deleteUser(authUserId).catch(() => undefined);
    throw err instanceof AuthError
      ? err
      : new AuthError("setup_failed", "Could not create firm tenant.");
  }
}
