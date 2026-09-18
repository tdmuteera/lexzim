import { and, eq } from "drizzle-orm";
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
import {
  ensureEmployeeProfileForUser,
  getStaffProfile,
  linkStaffProfileToUser,
  listStaffWithoutSystemLogin,
} from "@/lib/repos/hr";
import { jobCategoryImpliesLawyer } from "@/lib/hr/job-categories";
import { getPrimaryCommunicationEmail } from "@/lib/repos/staff-communication-emails";
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

function isRealContactEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.includes("@") && !email.includes(".lexzim.local");
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
        isTestUser: users.isTestUser,
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
    const eligibleStaff = await listStaffWithoutSystemLogin(firmId);
    const items = await Promise.all(
      filtered.map(async (row) => {
        const grants = row.isSystemUser
          ? await getEffectivePermissionCodes({
              userId: row.id,
              roleId: row.roleId,
              roleCode: row.roleCode,
              firmId,
              includeDelegations: false,
            })
          : [];
        const communicationEmail = row.isSystemUser
          ? (await getPrimaryCommunicationEmail(firmId, row.id)) || row.email
          : null;
        return {
          id: row.id,
          email: row.email,
          fullName: row.fullName,
          jobTitle: row.jobTitle,
          isActive: row.isActive,
          isSystemUser: row.isSystemUser,
          isLawyer: row.isLawyer,
          isTestUser: row.isTestUser,
          roleCode: row.roleCode,
          roleName: row.roleName,
          lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
          permissionCodes: row.isSystemUser ? navTicksFromGrants(grants) : [],
          isProtectedMp: row.roleCode === "managing_partner",
          communicationEmail,
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
      eligibleStaff: eligibleStaff.map((row) => ({
        id: row.profile.id,
        fullName: row.profile.fullName,
        email: row.profile.email,
        jobTitle: row.profile.jobTitle,
        employeeNumber: row.profile.employeeNumber,
        userId: row.profile.userId,
        linkedDirectoryOnly: row.userIsSystemUser === false,
      })),
    });
  } catch (err) {
    return jsonError(err, request);
  }
}

/**
 * Create a firm user (login) or directory person (no login).
 * System logins (except test users) must select an existing HR staff profile.
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
      isTestUser?: boolean;
      staffProfileId?: string;
    };

    const isSystemUser = body.isSystemUser !== false;
    const isTestUser = body.isTestUser === true;
    const tickCodes = parseTickCodes(body.permissionCodes);
    const forceChange = body.forceChange !== false;

    if (!isSystemUser) {
      const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
      if (!fullName) throw new AuthError("validation", "fullName is required.");
      const jobTitle =
        typeof body.jobTitle === "string" && body.jobTitle.trim()
          ? body.jobTitle.trim()
          : null;
      const isLawyer = body.isLawyer !== false;
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

    await assertSeatAvailable(firmId);

    const db = getDb();
    const roleRows = await db.select().from(roles).where(eq(roles.code, DEFAULT_ROLE)).limit(1);
    const role = roleRows[0];
    if (!role) throw new AuthError("validation", "Default staff role is missing. Seed RBAC.");

    const providedPassword = typeof body.password === "string" ? body.password.trim() : "";
    const generatedTemp = providedPassword ? null : generateTempPassword();
    const password = providedPassword || generatedTemp!;
    validatePassword(password);

    let fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
    let jobTitle =
      typeof body.jobTitle === "string" && body.jobTitle.trim()
        ? body.jobTitle.trim()
        : null;
    let isLawyer = body.isLawyer === true;
    let staffProfileId =
      typeof body.staffProfileId === "string" ? body.staffProfileId.trim() : "";
    let promoteUserId: string | null = null;

    if (!isTestUser) {
      if (!staffProfileId) {
        throw new AuthError(
          "validation",
          "Select an employee (staff record) before creating a system login. Every login must belong to a staff member.",
        );
      }
      const staff = await getStaffProfile(firmId, staffProfileId);
      if (!staff?.profile) {
        throw new AuthError("not_found", "Staff record not found.");
      }
      if (!staff.profile.isActive) {
        throw new AuthError("validation", "That staff record is inactive.");
      }
      if (staff.userIsSystemUser === true) {
        throw new AuthError(
          "validation",
          "That employee already has a system login.",
        );
      }
      fullName = staff.profile.fullName;
      jobTitle = staff.profile.jobTitle ?? null;
      if (body.isLawyer === undefined) {
        isLawyer =
          Boolean(staff.userIsLawyer) ||
          jobCategoryImpliesLawyer(staff.profile.jobCategory);
      }
      if (staff.profile.userId && staff.userIsSystemUser === false) {
        promoteUserId = staff.profile.userId;
      }
      if (!body.email?.trim() && isRealContactEmail(staff.profile.email)) {
        body.email = staff.profile.email!;
      }
    } else if (!fullName) {
      throw new AuthError("validation", "fullName is required for test users.");
    }

    const email = validateEmail(body.email ?? "");

    const existingEmail = await db
      .select({ id: users.id, isSystemUser: users.isSystemUser })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existingEmail[0] && existingEmail[0].id !== promoteUserId) {
      throw new AuthError("validation", "A user with this email already exists.");
    }

    const admin = createAdminClient();
    let createdUserId: string;

    if (promoteUserId) {
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        id: promoteUserId,
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
            : createError?.message || "Could not create login for this employee.",
        );
      }
      createdUserId = created.user.id;

      try {
        await db
          .update(users)
          .set({
            email,
            fullName,
            jobTitle,
            isActive: true,
            isSystemUser: true,
            isLawyer,
            isTestUser: false,
            mustChangePassword: forceChange,
            updatedAt: new Date(),
          })
          .where(and(eq(users.id, promoteUserId), eq(users.firmId, firmId)));

        if (tickCodes) {
          const expanded = expandAccessTicks(tickCodes);
          await replaceUserPermissionCodes({
            userId: createdUserId,
            firmId,
            codes: expanded,
            actorUserId: session.id,
            targetRoleCode: DEFAULT_ROLE,
          });
        } else {
          await copyRolePermissionsToUser(createdUserId, firmId, role.id);
        }
      } catch (err) {
        await admin.auth.admin.deleteUser(createdUserId).catch(() => undefined);
        throw err;
      }
    } else {
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
      createdUserId = created.user.id;

      try {
        await db.insert(users).values({
          id: createdUserId,
          firmId,
          email,
          fullName,
          jobTitle,
          roleId: role.id,
          isActive: true,
          isSystemUser: true,
          isLawyer,
          isTestUser,
          mustChangePassword: forceChange,
        });

        if (tickCodes) {
          const expanded = expandAccessTicks(tickCodes);
          await replaceUserPermissionCodes({
            userId: createdUserId,
            firmId,
            codes: expanded,
            actorUserId: session.id,
            targetRoleCode: DEFAULT_ROLE,
          });
        } else {
          await copyRolePermissionsToUser(createdUserId, firmId, role.id);
        }

        if (staffProfileId) {
          await linkStaffProfileToUser(firmId, staffProfileId, createdUserId);
        } else if (!isTestUser) {
          await ensureEmployeeProfileForUser({
            firmId,
            userId: createdUserId,
            fullName,
            email,
            jobTitle,
            isTestUser: false,
          });
        }
      } catch (err) {
        await admin.auth.admin.deleteUser(createdUserId).catch(() => undefined);
        throw err;
      }
    }

    await writeAuditLog({
      action: "users.create",
      firmId,
      userId: session.id,
      entityType: "user",
      entityId: createdUserId,
      metadata: {
        email,
        fullName,
        jobTitle,
        isLawyer,
        isTestUser,
        staffProfileId: staffProfileId || null,
        promotedDirectoryUser: Boolean(promoteUserId),
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
          id: createdUserId,
          email,
          fullName,
          jobTitle,
          roleCode: DEFAULT_ROLE,
          isActive: true,
          isSystemUser: true,
          isLawyer,
          isTestUser,
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
