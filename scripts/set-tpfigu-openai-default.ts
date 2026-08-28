/**
 * Point T Pfigu Attorneys at the cheap OpenAI go-to model (gpt-4o-mini).
 * The provider escalates up the ladder automatically for complex tasks.
 * Usage: npx tsx scripts/set-tpfigu-openai-default.ts
 */
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { aiSettings } from "../lib/db/schema";

config({ path: ".env.local" });

const FIRM_ID = "6e68cf32-2ba7-48d4-af08-ffbb1262cf78";
const GO_TO_MODEL = "gpt-4o-mini";
const EMBED = "gemini-embedding-001"; // keep existing pack vectors working

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL / DIRECT_URL required");

  const sql = postgres(url, { ssl: "require", prepare: false, max: 1 });
  const db = drizzle(sql);

  const updated = await db
    .update(aiSettings)
    .set({
      providerDefault: "openai",
      modelDefault: GO_TO_MODEL,
      embeddingsModel: EMBED,
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

  console.log(JSON.stringify(updated, null, 2));
  await sql.end({ timeout: 5 });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
