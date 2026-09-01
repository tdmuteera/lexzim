/**
 * Point T Pfigu Attorneys at Claude (Anthropic) firm-wide.
 * Usage: npx tsx scripts/set-tpfigu-claude-default.ts
 */
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { aiSettings } from "../lib/db/schema";

config({ path: ".env.local" });

const FIRM_ID = "6e68cf32-2ba7-48d4-af08-ffbb1262cf78";
const CLAUDE_MODEL = "claude-sonnet-4-5";
const EMBED = "gemini-embedding-001";

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL / DIRECT_URL required");

  const sql = postgres(url, { ssl: "require", prepare: false, max: 1 });
  const db = drizzle(sql);

  const updated = await db
    .update(aiSettings)
    .set({
      providerDefault: "claude",
      modelDefault: CLAUDE_MODEL,
      embeddingsModel: EMBED,
      routingMode: "manual",
      updatedAt: new Date(),
    })
    .where(eq(aiSettings.firmId, FIRM_ID))
    .returning({
      firmId: aiSettings.firmId,
      provider: aiSettings.providerDefault,
      model: aiSettings.modelDefault,
      embeddings: aiSettings.embeddingsModel,
      routing: aiSettings.routingMode,
    });

  if (!updated.length) {
    const inserted = await db
      .insert(aiSettings)
      .values({
        firmId: FIRM_ID,
        providerDefault: "claude",
        modelDefault: CLAUDE_MODEL,
        embeddingsModel: EMBED,
        routingMode: "manual",
        webLookupEnabled: true,
        monthlySoftBudget: 500,
        maxOutputTokens: 3600,
        matterContextEnabled: true,
        keyMode: "direct",
        updatedAt: new Date(),
      })
      .returning({
        firmId: aiSettings.firmId,
        provider: aiSettings.providerDefault,
        model: aiSettings.modelDefault,
        embeddings: aiSettings.embeddingsModel,
        routing: aiSettings.routingMode,
      });
    console.log(JSON.stringify(inserted, null, 2));
  } else {
    console.log(JSON.stringify(updated, null, 2));
  }

  await sql.end({ timeout: 5 });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
