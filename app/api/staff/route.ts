import { eq } from "drizzle-orm";
import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { validateEmail, validatePassword } from "@/lib/auth/password";
import { generateTempPassword } from "@/lib/auth/temp-password";
import { getDb } from "@/lib/db";
import { roles, users } from "@/lib/db/schema";
import {
  assertSeatAvailable,
  getLicenceUsage,
} from "@/lib/licensing/policy";
import { createDirectoryPerson } from "@/lib/repos/directory-people";
import { requirePermission } from "@/lib/rbac/guards";
import {
  copyRolePermissionsToUser,
  getEffectivePermissionCodes,
  replaceUserPermissionCodes,
} from "@/lib/rbac/repository";
import {
  expandAccessTicks,
  navTicksFromGrants,
} from "@/lib/rbac/access-ticks";
import { createAdminClient } from "@/lib/supabase/admin";
import { tenantFirmId } from "@/lib/tenant/scope";

const DEFAULT_ROLE = "junior_associate";

function parseTickCodes(raw: unknown): string[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) {
    throw new AuthError("validation", "permissionCodes must be an array of tick codes.");
  }
  return raw.filter((c): c is string => typeof c === "string" && c.trim().length > 0);
}

/** List firm users + seat usage + current access ticks. */
export async function GET(request: Request) {
  try {
    const session = await requirePermission("users.manage");
    const firmId = tenantFirmId(session);
    const db = getDb();
    const scope = new URL(request.url).searchParams.get("scope") ?? "all";

    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        jobTitle: users.jobTitle,
        isActive: users.isActive,
        isSystemUser: users.isSystemUser,
        isLawyer: users.isLawyer,
        roleCode: roles.code,
        roleName: roles.name,
        roleId: roles.id,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users)
      .innerJoin(roles, eq(users.roleId, roles.id))
      .where(eq(users.firmId, firmId))
      .orderBy(users.fullName);

    const filtered =
      scope === "system"
        ? rows.filter((r) => r.isSystemUser)
        : scope === "directory"
          ? rows.filter((r) => !r.isSystemUser)
          : rows;

    const usage = await getLicenceUsage(firmId);
    const items = await Promise.all(
      filtered.map(async (row) => {
        const grants = row.isSystemUser
          ? await getEffectivePermissionCodes({
              userId: row.id,
              roleId: row.roleId,
              roleCode: row.roleCode,
            })
          : [];
        return {
          id: row.id,
          email: row.email,
          fullName: row.fullName,
          jobTitle: row.jobTitle,
          isActive: row.isActive,
          isSystemUser: row.isSystemUser,
          isLawyer: row.isLawyer,
          roleCode: row.roleCode,
          roleName: row.roleName,
          lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
          permissionCodes: row.isSystemUser ? navTicksFromGrants(grants) : [],
          isProtectedMp: row.roleCode === "managing_partner",
        };
      }),
    );

    return jsonOk({
      items,
      seats: {
        limit: usage.seats,
        used: usage.seatsUsed,
        remaining: usage.seatsRemaining,
        edition: usage.edition,
      },
    });
  } catch (err) {
    return jsonError(err, request);
  }
}

/**
 * Create a firm user (login) or directory person (no login).
 * Body: {
 *   email?, fullName, password?, jobTitle?, permissionCodes?,
 *   isSystemUser?: boolean (default true),
 *   isLawyer?: boolean
 * }
 */
export async function POST(request: Request) {
  try {
    const session = await requirePermission("users.manage");
    const firmId = tenantFirmId(session);
    const body = (await request.json()) as {
      email?: string;
      fullName?: string;
      password?: string;
      jobTitle?: string;
      permissionCodes?: unknown;
      roleCode?: string;
      forceChange?: boolean;
      isSystemUser?: boolean;
      isLawyer?: boolean;
    };

    const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
    if (!fullName) throw new AuthError("validation", "fullName is required.");
    const jobTitle =
      typeof body.jobTitle === "string" && body.jobTitle.trim()
        ? body.jobTitle.trim()
        : null;
    const isSystemUser = body.isSystemUser !== false;
    const isLawyer = body.isLawyer === true || (!isSystemUser && body.isLawyer !== false);

    if (!isSystemUser) {
      const person = await createDirectoryPerson(firmId, {
        fullName,
        email: body.email ?? null,
        jobTitle,
        isLawyer,
      });

      await writeAuditLog({
        action: "users.create_directory",
        firmId,
        userId: session.id,
        entityType: "user",
        entityId: person.id,
        metadata: {
          email: person.email,
          fullName: person.fullName,
          jobTitle: person.jobTitle,
          isLawyer: person.isLawyer,
          isSystemUser: false,
        },
        ipOrUserAgent: clientInfo(request),
      });

      const usage = await getLicenceUsage(firmId);
      return jsonOk(
        {
          user: {
            id: person.id,
            email: person.email,
            fullName: person.fullName,
            jobTitle: person.jobTitle,
            roleCode: DEFAULT_ROLE,
            isActive: true,
            isSystemUser: false,
            isLawyer: person.isLawyer,
            mustChangePassword: false,
          },
          tempPassword: null,
          seats: {
            limit: usage.seats,
            used: usage.seatsUsed,
            remaining: usage.seatsRemaining,
          },
        },
        { status: 201 },
      );
    }

    const email = validateEmail(body.email ?? "");
    const providedPassword = typeof body.password === "string" ? body.password.trim() : "";
    const generatedTemp = providedPassword ? null : generateTempPassword();
    const password = providedPassword || generatedTemp!;
    validatePassword(password);
    const forceChange = body.forceChange !== false;
    const tickCodes = parseTickCodes(body.permissionCodes);

    await assertSeatAvailable(firmId);

    const db = getDb();
    const roleRows = await db.select().from(roles).where(eq(roles.code, DEFAULT_ROLE)).limit(1);
    const role = roleRows[0];
    if (!role) throw new AuthError("validation", "Default staff role is missing. Seed RBAC.");

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
      password,
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
        jobTitle,
        roleId: role.id,
        isActive: true,
        isSystemUser: true,
        isLawyer,
        mustChangePassword: forceChange,
      });

      if (tickCodes) {
        const expanded = expandAccessTicks(tickCodes);
        await replaceUserPermissionCodes({
          userId: created.user.id,
          firmId,
          codes: expanded,
          actorUserId: session.id,
          targetRoleCode: DEFAULT_ROLE,
        });
      } else {
        await copyRolePermissionsToUser(created.user.id, firmId, role.id);
      }
    } catch (err) {
      await admin.auth.admin.deleteUser(created.user.id).catch(() => undefined);
      throw err;
    }

    await writeAuditLog({
      action: "users.create",
      firmId,
      userId: session.id,
      entityType: "user",
      entityId: created.user.id,
      metadata: {
        email,
        fullName,
        jobTitle,
        isLawyer,
        tempPasswordGenerated: Boolean(generatedTemp),
        forceChange,
        permissionCodes: tickCodes,
      },
      ipOrUserAgent: clientInfo(request),
    });

    const usage = await getLicenceUsage(firmId);
    return jsonOk(
      {
        user: {
          id: created.user.id,
          email,
          fullName,
          jobTitle,
          roleCode: DEFAULT_ROLE,
          isActive: true,
          isSystemUser: true,
          isLawyer,
          mustChangePassword: forceChange,
        },
        tempPassword: generatedTemp ?? null,
        seats: {
          limit: usage.seats,
          used: usage.seatsUsed,
          remaining: usage.seatsRemaining,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    return jsonError(err, request);
  }
}
