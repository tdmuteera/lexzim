/**
 * Seed roles, permissions, and role_permissions matrix.
 * Safe to re-run (upserts by unique codes). Does NOT create users.
 *
 * Usage: npx tsx scripts/seed-rbac.ts
 */
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { permissions, rolePermissions, roles } from "../lib/db/schema";
import {
  PERMISSION_DEFS,
  ROLE_DEFS,
  ROLE_PERMISSION_MATRIX,
} from "../lib/rbac/matrix";

config({ path: ".env.local" });

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL / DIRECT_URL missing");
  }

  const sql = postgres(url, { ssl: "require", prepare: false, max: 1 });
  const db = drizzle(sql);

  console.log("Seeding roles…");
  for (const role of ROLE_DEFS) {
    const existing = await db.select().from(roles).where(eq(roles.code, role.code)).limit(1);
    if (existing[0]) {
      await db
        .update(roles)
        .set({ name: role.name, description: role.description })
        .where(eq(roles.code, role.code));
    } else {
      await db.insert(roles).values(role);
    }
  }

  console.log("Seeding permissions…");
  for (const perm of PERMISSION_DEFS) {
    const existing = await db
      .select()
      .from(permissions)
      .where(eq(permissions.code, perm.code))
      .limit(1);
    if (existing[0]) {
      await db
        .update(permissions)
        .set({
          name: perm.name,
          description: perm.description,
          module: perm.module,
        })
        .where(eq(permissions.code, perm.code));
    } else {
      await db.insert(permissions).values(perm);
    }
  }

  const allRoles = await db.select().from(roles);
  const allPerms = await db.select().from(permissions);
  const roleByCode = Object.fromEntries(allRoles.map((r) => [r.code, r]));
  const permByCode = Object.fromEntries(allPerms.map((p) => [p.code, p]));

  console.log("Seeding role_permissions…");
  for (const [roleCode, codes] of Object.entries(ROLE_PERMISSION_MATRIX)) {
    const role = roleByCode[roleCode];
    if (!role) throw new Error(`Missing role ${roleCode}`);

    await db.delete(rolePermissions).where(eq(rolePermissions.roleId, role.id));

    const rows = codes.map((code) => {
      const perm = permByCode[code];
      if (!perm) throw new Error(`Missing permission ${code}`);
      return { roleId: role.id, permissionId: perm.id };
    });

    if (rows.length) {
      await db.insert(rolePermissions).values(rows);
    }
    console.log(`  ${roleCode}: ${rows.length} permissions`);
  }

  await sql.end({ timeout: 5 });
  console.log("RBAC seed complete. No users created (P0-07/P0-11).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
