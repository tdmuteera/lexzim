import { eq } from "drizzle-orm";
import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { validateEmail, validatePassword } from "@/lib/auth/password";
import { getDb } from "@/lib/db";
import { roles, users } from "@/lib/db/schema";
import {
  assertSeatAvailable,
  getLicenceUsage,
} from "@/lib/licensing/policy";
import { requirePermission } from "@/lib/rbac/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { tenantFirmId } from "@/lib/tenant/scope";

const INVITABLE_ROLES = [
  "managing_partner",
  "senior_associate",
  "junior_associate",
  "secretary",
  "accounts",
] as const;

/** List firm users + seat usage. */
export async function GET() {
  try {
    const session = await requirePermission("users.manage");
    const firmId = tenantFirmId(session);
    const db = getDb();

    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        isActive: users.isActive,
        roleCode: roles.code,
        roleName: roles.name,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .where(eq(users.firmId, firmId))
      .orderBy(users.fullName);

    const usage = await getLicenceUsage(firmId);

    return jsonOk({
      items: rows.map((row) => ({
        ...row,
        lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
      })),
      seats: {
        limit: usage.seats,
        used: usage.seatsUsed,
        remaining: usage.seatsRemaining,
        edition: usage.edition,
      },
      invitableRoles: INVITABLE_ROLES,
    });
  } catch (err) {
    return jsonError(err);
  }
}

/**
 * Invite / create a firm user (seat-limited).
 * Body: { email, fullName, password, roleCode }
 */
export async function POST(request: Request) {
  try {
    const session = await requirePermission("users.manage");
    const firmId = tenantFirmId(session);
    const body = (await request.json()) as {
      email?: string;
      fullName?: string;
      password?: string;
      roleCode?: string;
    };

    const email = validateEmail(body.email ?? "");
    const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
    if (!fullName) throw new AuthError("validation", "fullName is required.");
    validatePassword(body.password ?? "");
    const roleCode = (body.roleCode ?? "junior_associate").trim();
    if (!(INVITABLE_ROLES as readonly string[]).includes(roleCode)) {
      throw new AuthError(
        "validation",
        `roleCode must be one of: ${INVITABLE_ROLES.join(", ")}.`,
      );
    }

    await assertSeatAvailable(firmId);

    const db = getDb();
    const roleRows = await db.select().from(roles).where(eq(roles.code, roleCode)).limit(1);
    const role = roleRows[0];
    if (!role) throw new AuthError("validation", "Role not found.");

    const existing = await db
      .select({ id: users.id, firmId: users.firmId })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existing[0]) {
      throw new AuthError("validation", "A user with this email already exists.");
    }

    const admin = createAdminClient();
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: body.password!,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (createError || !created.user) {
      throw new AuthError(
        "validation",
        createError?.message?.includes("already")
          ? "A user with this email already exists in auth."
          : "Could not create user.",
      );
    }

    try {
      await db.insert(users).values({
        id: created.user.id,
        firmId,
        email,
        fullName,
        roleId: role.id,
        isActive: true,
      });
    } catch (err) {
      await admin.auth.admin.deleteUser(created.user.id).catch(() => undefined);
      throw err;
    }

    await writeAuditLog({
      action: "users.invite",
      firmId,
      userId: session.id,
      entityType: "user",
      entityId: created.user.id,
      metadata: { email, roleCode, fullName },
      ipOrUserAgent: clientInfo(request),
    });

    const usage = await getLicenceUsage(firmId);
    return jsonOk(
      {
        user: {
          id: created.user.id,
          email,
          fullName,
          roleCode,
          isActive: true,
        },
        seats: {
          limit: usage.seats,
          used: usage.seatsUsed,
          remaining: usage.seatsRemaining,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    return jsonError(err);
  }
}
