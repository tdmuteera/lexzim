/**
 * RBAC repository stubs / helpers.
 * EVERY firm-scoped query MUST filter firm_id (users, audit, firm_settings, …).
 */
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { permissions, rolePermissions, roles, userPermissions } from "@/lib/db/schema";
import { AuthError } from "@/lib/auth/types";
import { expandAccessTicks } from "@/lib/rbac/access-ticks";

export async function getRoles() {
  const db = getDb();
  return db.select().from(roles).orderBy(roles.name);
}

export async function getRoleByCode(code: string) {
  const db = getDb();
  const rows = await db.select().from(roles).where(eq(roles.code, code)).limit(1);
  return rows[0] ?? null;
}

export async function getPermissionsForRole(roleId: string) {
  const db = getDb();
  return db
    .select({
      id: permissions.id,
      code: permissions.code,
      name: permissions.name,
      description: permissions.description,
      module: permissions.module,
    })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(eq(rolePermissions.roleId, roleId));
}

export async function getPermissionCodesForRole(roleId: string): Promise<string[]> {
  const {
    getCachedRolePermissionCodes,
    setCachedRolePermissionCodes,
  } = await import("@/lib/auth/hot-cache");
  const cached = getCachedRolePermissionCodes(roleId);
  if (cached) return cached;
  const rows = await getPermissionsForRole(roleId);
  const codes = rows.map((r) => r.code);
  setCachedRolePermissionCodes(roleId, codes);
  return codes;
}

function withProtectedMp(roleCode: string, codes: string[]): string[] {
  if (roleCode !== "managing_partner") return codes;
  const set = new Set(codes);
  set.add("users.manage");
  set.add("dashboard.view");
  set.add("clients.delete");
  return [...set];
}

/**
 * Per-person grants if any rows exist; otherwise the role matrix.
 * Managing Partner role always keeps users.manage and dashboard.view.
 */
export async function getEffectivePermissionCodes(input: {
  userId: string;
  roleId: string;
  roleCode: string;
  firmId: string;
  /** Default true. Set false when editing per-person ticks (exclude overlay). */
  includeDelegations?: boolean;
}): Promise<string[]> {
  const {
    getCachedUserPermissionCodes,
    setCachedUserPermissionCodes,
  } = await import("@/lib/auth/hot-cache");
  const cached = getCachedUserPermissionCodes(input.userId);
  let base: string[];
  if (cached !== undefined) {
    if (cached === null) {
      const roleCodes = await getPermissionCodesForRole(input.roleId);
      base = withProtectedMp(input.roleCode, roleCodes);
    } else {
      base = withProtectedMp(input.roleCode, expandAccessTicks(cached));
    }
  } else {
    const db = getDb();
    const rows = await db
      .select({ code: permissions.code })
      .from(userPermissions)
      .innerJoin(permissions, eq(userPermissions.permissionId, permissions.id))
      .where(eq(userPermissions.userId, input.userId));

    if (rows.length === 0) {
      setCachedUserPermissionCodes(input.userId, null);
      const roleCodes = await getPermissionCodesForRole(input.roleId);
      base = withProtectedMp(input.roleCode, roleCodes);
    } else {
      const codes = rows.map((r) => r.code);
      setCachedUserPermissionCodes(input.userId, codes);
      base = withProtectedMp(input.roleCode, expandAccessTicks(codes));
    }
  }

  if (input.includeDelegations === false) return base;

  const { listActiveDelegationCapabilities } = await import("@/lib/rbac/delegation");
  const delegated = await listActiveDelegationCapabilities(input.firmId, input.userId);
  if (delegated.length === 0) return base;
  return [...new Set([...base, ...delegated])];
}

export async function replaceUserPermissionCodes(input: {
  userId: string;
  firmId: string;
  codes: string[];
  actorUserId: string;
  targetRoleCode: string;
}): Promise<string[]> {
  const unique = [...new Set(input.codes.map((c) => c.trim()).filter(Boolean))];
  const isProtectedMp = input.targetRoleCode === "managing_partner";
  const isSelf = input.actorUserId === input.userId;
  if ((isProtectedMp || isSelf) && !unique.includes("users.manage")) {
    throw new AuthError(
      "validation",
      isSelf
        ? "You cannot remove your own User access tick (users.manage)."
        : "The Managing Partner must keep User access (users.manage).",
    );
  }
  if (isProtectedMp && !unique.includes("dashboard.view")) {
    unique.push("dashboard.view");
  }
  if (isProtectedMp && !unique.includes("clients.delete")) {
    unique.push("clients.delete");
  }

  const db = getDb();
  const permRows =
    unique.length === 0
      ? []
      : await db
          .select({ id: permissions.id, code: permissions.code })
          .from(permissions)
          .where(inArray(permissions.code, unique));

  const found = new Set(permRows.map((p) => p.code));
  const missing = unique.filter((c) => !found.has(c));
  if (missing.length) {
    throw new AuthError("validation", `Unknown permission: ${missing.join(", ")}.`);
  }

  await db
    .delete(userPermissions)
    .where(
      and(eq(userPermissions.userId, input.userId), eq(userPermissions.firmId, input.firmId)),
    );

  if (permRows.length) {
    await db.insert(userPermissions).values(
      permRows.map((p) => ({
        userId: input.userId,
        permissionId: p.id,
        firmId: input.firmId,
      })),
    );
  }

  const { clearCachedUserPermissionCodes } = await import("@/lib/auth/hot-cache");
  clearCachedUserPermissionCodes(input.userId);
  return permRows.map((p) => p.code);
}

export async function copyRolePermissionsToUser(userId: string, firmId: string, roleId: string) {
  const db = getDb();
  const rows = await db
    .select({ permissionId: rolePermissions.permissionId })
    .from(rolePermissions)
    .where(eq(rolePermissions.roleId, roleId));
  if (!rows.length) return;
  await db.insert(userPermissions).values(
    rows.map((r) => ({
      userId,
      permissionId: r.permissionId,
      firmId,
    })),
  );
  const { clearCachedUserPermissionCodes } = await import("@/lib/auth/hot-cache");
  clearCachedUserPermissionCodes(userId);
}
