import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { roles, users } from "@/lib/db/schema";
import { jsonError, jsonOk } from "@/lib/auth/http";
import { requirePermission } from "@/lib/rbac/guards";

/** Sample protected route: requires users.manage (P0-08). */
export async function GET() {
  try {
    const session = await requirePermission("users.manage");
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
      .where(eq(users.firmId, session.firm.id))
      .orderBy(users.fullName);

    return jsonOk({
      items: rows.map((row) => ({
        ...row,
        lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
      })),
    });
  } catch (err) {
    return jsonError(err);
  }
}
