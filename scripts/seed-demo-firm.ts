/**
 * DEV ONLY: seed a demo tenant (another firm in LPMS Core / LexZim).
 * Does not create users. Use platform admin or manual MP setup after.
 *
 * Usage: DEMO_SEED_ENABLED=1 npx tsx scripts/seed-demo-firm.ts
 */
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { firms } from "../lib/db/schema";

config({ path: ".env.local" });

async function main() {
  if (process.env.DEMO_SEED_ENABLED !== "1") {
    console.error("Set DEMO_SEED_ENABLED=1 to run demo firm seed.");
    process.exit(1);
  }

  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");

  const sql = postgres(url, { ssl: "require", prepare: false, max: 1 });
  const db = drizzle(sql);

  const slug = "demo-law-firm";
  const existing = await db.select().from(firms).where(eq(firms.slug, slug)).limit(1);
  if (existing[0]) {
    console.log("Demo firm already exists:", existing[0].name);
    await sql.end({ timeout: 5 });
    return;
  }

  const [firm] = await db
    .insert(firms)
    .values({
      name: "Demo Law Firm",
      slug,
      status: "demo",
      isDemo: true,
      defaultCurrency: "USD",
      city: "Harare",
      country: "Zimbabwe",
    })
    .returning();

  console.log("Created demo tenant:", firm?.name, firm?.id);
  console.log("Add a Managing Partner user for this firm via platform admin or Supabase + users row.");

  await sql.end({ timeout: 5 });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
