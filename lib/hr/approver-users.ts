/**
 * Resolve firm users who hold a permission via role defaults, ticks, or delegation.
 */
import "server-only";

import { and, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  delegationGrants,
  permissions,
  rolePermissions,
  userPermissions,
  users,
} from "@/lib/db/schema";

export async function listUsersWithPermissionCode(
  firmId: string,
  permissionCode: string,
): Promise<string[]> {
  const db = getDb();
  const now = new Date();

  const activeLogins = await db
    .select({ id: users.id, roleId: users.roleId })
    .from(users)
    .where(
      and(
        eq(users.firmId, firmId),
        eq(users.isActive, true),
        eq(users.isSystemUser, true),
      ),
    );
  if (activeLogins.length === 0) return [];

  const roleIds = [...new Set(activeLogins.map((u) => u.roleId))];
  const rolesWithPerm = await db
    .select({ roleId: rolePermissions.roleId })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(
      and(
        inArray(rolePermissions.roleId, roleIds),
        eq(permissions.code, permissionCode),
      ),
    );
  const roleSet = new Set(rolesWithPerm.map((r) => r.roleId));

  const loginIds = activeLogins.map((u) => u.id);
  const tickRows = await db
    .select({ userId: userPermissions.userId, code: permissions.code })
    .from(userPermissions)
    .innerJoin(permissions, eq(userPermissions.permissionId, permissions.id))
    .where(inArray(userPermissions.userId, loginIds));

  const usersWithCustomTicks = new Set(tickRows.map((r) => r.userId));
  const usersWithTick = new Set(
    tickRows.filter((r) => r.code === permissionCode).map((r) => r.userId),
  );

  const delegated = await db
    .select({ id: delegationGrants.granteeUserId })
    .from(delegationGrants)
    .where(
      and(
        eq(delegationGrants.firmId, firmId),
        eq(delegationGrants.capability, permissionCode),
        isNull(delegationGrants.revokedAt),
        or(isNull(delegationGrants.expiresAt), gt(delegationGrants.expiresAt, now)),
        inArray(delegationGrants.granteeUserId, loginIds),
      ),
    );
  const delegatedSet = new Set(delegated.map((d) => d.id));

  const out = new Set<string>();
  for (const u of activeLogins) {
    if (delegatedSet.has(u.id)) {
      out.add(u.id);
      continue;
    }
    if (usersWithCustomTicks.has(u.id)) {
      if (usersWithTick.has(u.id)) out.add(u.id);
      continue;
    }
    if (roleSet.has(u.roleId)) out.add(u.id);
  }
  return [...out];
}
