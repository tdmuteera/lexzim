/**
 * Clear firm BYO Claude key so Railway ANTHROPIC_API_KEY is used.
 * Usage: npx tsx scripts/clear-firm-byo-claude.ts
 */
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq } from "drizzle-orm";
import postgres from "postgres";
import { firmSettings } from "../lib/db/schema";

config({ path: ".env.local" });

const FIRM_ID = "6e68cf32-2ba7-48d4-af08-ffbb1262cf78";
const BYO_KEY = "ai_byo_claude_key";

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL / DIRECT_URL required");

  const sql = postgres(url, { ssl: "require", prepare: false, max: 1 });
  const db = drizzle(sql);

  const before = await db
    .select({ value: firmSettings.value })
    .from(firmSettings)
    .where(and(eq(firmSettings.firmId, FIRM_ID), eq(firmSettings.key, BYO_KEY)))
    .limit(1);

  const hadByo = Boolean(before[0]?.value?.trim());

  await db
    .update(firmSettings)
    .set({ value: "", updatedAt: new Date() })
    .where(and(eq(firmSettings.firmId, FIRM_ID), eq(firmSettings.key, BYO_KEY)));

  console.log(
    JSON.stringify({
      firmId: FIRM_ID,
      cleared: BYO_KEY,
      hadByoEncryptedValue: hadByo,
    }),
  );

  await sql.end({ timeout: 5 });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
