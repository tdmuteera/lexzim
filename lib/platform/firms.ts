import "server-only";

import { AuthError } from "@/lib/auth/types";
import { slugifyFirmName, validateEmail, validatePassword } from "@/lib/auth/password";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDb } from "@/lib/db";
import { firms, roles, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requirePlatformAdmin } from "@/lib/platform/admin";
import { writeAuditLog } from "@/lib/auth/audit";
import { ensureTrialLicence } from "@/lib/repos/licences";

export type FirmOpsStatus = "active" | "trial" | "demo" | "suspended" | "archived";

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

    await ensureTrialLicence(firm.id, {
      issuedBy: `platform:${admin.email}`,
      notes: isDemo ? "Demo firm trial" : "New firm trial",
    });

    return { firmId: firm.id, userId: authUserId, slug };
  } catch (err) {
    await supabaseAdmin.auth.admin.deleteUser(authUserId).catch(() => undefined);
    throw err instanceof AuthError
      ? err
      : new AuthError("setup_failed", "Could not create firm tenant.");
  }
}

const OPS_STATUSES: FirmOpsStatus[] = [
  "active",
  "trial",
  "demo",
  "suspended",
  "archived",
];

export function parseFirmOpsStatus(raw: string): FirmOpsStatus {
  const s = raw.trim().toLowerCase();
  if (!(OPS_STATUSES as string[]).includes(s)) {
    throw new AuthError(
      "validation",
      `status must be one of: ${OPS_STATUSES.join(", ")}.`,
    );
  }
  return s as FirmOpsStatus;
}

/**
 * Soft-disable / restore a firm (no matter wipe). Suspended firms cannot sign in.
 */
export async function platformSetFirmStatus(
  firmId: string,
  status: FirmOpsStatus,
  opts?: { ipOrUserAgent?: string | null; notes?: string | null },
) {
  const admin = await requirePlatformAdmin();
  const db = getDb();
  const rows = await db
    .update(firms)
    .set({
      status,
      archivedAt: status === "archived" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(firms.id, firmId))
    .returning();
  const firm = rows[0];
  if (!firm) throw new AuthError("not_found", "Firm not found.");

  await writeAuditLog({
    action:
      status === "suspended"
        ? "platform.firm_suspended"
        : status === "archived"
          ? "platform.firm_archived"
          : "platform.firm_status",
    firmId: firm.id,
    userId: admin.id,
    entityType: "firm",
    entityId: firm.id,
    metadata: { status, notes: opts?.notes ?? null, slug: firm.slug },
    ipOrUserAgent: opts?.ipOrUserAgent ?? null,
  });

  return firm;
}
