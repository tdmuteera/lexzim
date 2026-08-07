/**
 * RBAC repository stubs / helpers.
 * EVERY firm-scoped query MUST filter firm_id (users, audit, firm_settings, …).
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { permissions, rolePermissions, roles } from "@/lib/db/schema";

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
  const rows = await getPermissionsForRole(roleId);
  return rows.map((r) => r.code);
}
