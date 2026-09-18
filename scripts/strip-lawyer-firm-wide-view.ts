/**
 * Remove accidental firm-wide client/matter view grants from practice lawyers.
 * Older access-tick expansion bundled matters.view_all into the Matters tick.
 * Re-run safely. Managing Partner and accounts keep firm-wide view.
 *
 * Usage: npx tsx scripts/strip-lawyer-firm-wide-view.ts
 */
import { config } from "dotenv";
import { and, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { permissions, roles, userPermissions, users } from "../lib/db/schema";

config({ path: ".env.local" });
config({ path: ".env" });

const STRIP_ROLES = ["senior_associate", "junior_associate", "secretary"] as const;
const STRIP_CODES = ["matters.view_all", "clients.view_all"] as const;

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL / DIRECT_URL missing");

  const client = postgres(url, { ssl: "require", prepare: false, max: 1 });
  const db = drizzle(client);

  const roleRows = await db
    .select({ id: roles.id, code: roles.code })
    .from(roles)
    .where(inArray(roles.code, [...STRIP_ROLES]));
  const roleIds = roleRows.map((r) => r.id);
  if (!roleIds.length) {
    console.log("No practice-lawyer roles found; nothing to strip.");
    await client.end();
    return;
  }

  const permRows = await db
    .select({ id: permissions.id, code: permissions.code })
    .from(permissions)
    .where(inArray(permissions.code, [...STRIP_CODES]));
  const permIds = permRows.map((p) => p.id);
  if (!permIds.length) {
    console.log("Permission codes not seeded yet.");
    await client.end();
    return;
  }

  const affectedUsers = await db
    .select({ id: users.id, email: users.email, roleCode: roles.code })
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(inArray(users.roleId, roleIds));

  const result = await db
    .delete(userPermissions)
    .where(
      and(
        inArray(userPermissions.permissionId, permIds),
        inArray(
          userPermissions.userId,
          affectedUsers.length
            ? affectedUsers.map((u) => u.id)
            : ["00000000-0000-0000-0000-000000000000"],
        ),
      ),
    )
    .returning({ userId: userPermissions.userId });

  const byUser = new Map<string, number>();
  for (const row of result) {
    byUser.set(row.userId, (byUser.get(row.userId) ?? 0) + 1);
  }

  console.log(
    `Stripped ${result.length} user_permission row(s) across ${byUser.size} user(s).`,
  );
  for (const u of affectedUsers) {
    const n = byUser.get(u.id) ?? 0;
    if (n > 0) console.log(`  ${u.roleCode} ${u.email}: removed ${n}`);
  }

  // Also drop those codes from role_permissions for practice roles (matrix sync).
  const rolePermDeleted = await db.execute(sql`
    DELETE FROM role_permissions rp
    USING roles r, permissions p
    WHERE rp.role_id = r.id
      AND rp.permission_id = p.id
      AND r.code IN ('senior_associate', 'junior_associate', 'secretary')
      AND p.code IN ('matters.view_all', 'clients.view_all')
  `);
  console.log("role_permissions cleanup done.", rolePermDeleted);

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
