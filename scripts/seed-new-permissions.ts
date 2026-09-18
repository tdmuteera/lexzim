/**
 * Upsert new permission defs (safe to re-run).
 * Usage: npx tsx scripts/seed-new-permissions.ts
 */
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { permissions } from "../lib/db/schema";
import { PERMISSION_DEFS } from "../lib/rbac/matrix";

config({ path: ".env.local" });

const NEEDED = [
  "hr.leave.request",
  "hr.advances.request",
  "billing.my_clients.view",
] as const;

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL / DIRECT_URL missing");
  const client = postgres(url, { ssl: "require", prepare: false, max: 1 });
  const db = drizzle(client);

  for (const code of NEEDED) {
    const def = PERMISSION_DEFS.find((p) => p.code === code);
    if (!def) {
      console.log("missing def", code);
      continue;
    }
    const existing = await db
      .select({ id: permissions.id })
      .from(permissions)
      .where(eq(permissions.code, code))
      .limit(1);
    if (existing[0]) {
      await db
        .update(permissions)
        .set({
          name: def.name,
          description: def.description,
          module: def.module,
        })
        .where(eq(permissions.code, code));
      console.log("updated", code);
      continue;
    }
    await db.insert(permissions).values(def);
    console.log("inserted", code);
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
