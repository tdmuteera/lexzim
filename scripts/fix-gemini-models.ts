/**
 * Point every firm at current Gemini models, then embed the system knowledge pack.
 * Usage: npx tsx scripts/fix-gemini-models.ts
 */
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { aiSettings, firms } from "../lib/db/schema";

config({ path: ".env.local" });

const CHAT = "gemini-3.6-flash";
const EMBED = "gemini-embedding-001";

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL / DIRECT_URL required");

  const sql = postgres(url, { ssl: "require", prepare: false, max: 1 });
  const db = drizzle(sql);

  const updated = await db
    .update(aiSettings)
    .set({
      modelDefault: CHAT,
      embeddingsModel: EMBED,
      updatedAt: new Date(),
    })
    .returning({ firmId: aiSettings.firmId });

  const allFirms = await db.select({ id: firms.id, slug: firms.slug }).from(firms);
  console.log(`Updated stale chat models: ${updated.length}`);
  console.log(`Firms: ${allFirms.map((f) => f.slug).join(", ") || "(none)"}`);

  const firmId = allFirms[0]?.id;
  if (!firmId) {
    await sql.end({ timeout: 5 });
    throw new Error("No firm to use as provider context");
  }

  // Dynamic import so dotenv is loaded before server-only modules read env
  const { kbReingestAll } = await import("../lib/ai/kb/ingest-starter");
  console.log("Re-ingesting + embedding knowledge pack…");
  const result = await kbReingestAll(firmId);
  console.log(
    JSON.stringify(
      {
        packChunks: result.pack.chunksWritten,
        embedded: result.embeddings.embedded,
        failed: result.embeddings.failed,
        error: result.embeddings.errorCode ?? null,
        message: result.embeddings.message ?? null,
        model: result.embeddings.modelName,
      },
      null,
      2,
    ),
  );

  await sql.end({ timeout: 5 });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
