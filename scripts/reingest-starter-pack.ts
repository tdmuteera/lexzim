/**
 * Direct DB re-ingest of starter pack v3 (avoids server-only import barrier).
 * Usage: npx tsx scripts/reingest-starter-pack.ts
 */
import { createHash } from "crypto";
import { config } from "dotenv";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  aiEmbeddings,
  knowledgeChunks,
  knowledgeSources,
} from "../lib/db/schema";
import {
  STARTER_KB_SOURCES,
  STARTER_PACK_VERSION,
  estimateTokens,
} from "../lib/ai/kb/starter-pack";

config({ path: ".env.local" });

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function chunkWindows(headingPath: string, text: string) {
  // Keep sections intact for short starter notes (matches pack intent).
  const body = `${headingPath}\n${text}`.trim();
  return [
    {
      headingPath,
      text: body,
      tokenEstimate: estimateTokens(body),
    },
  ];
}

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL / DIRECT_URL required");
  if (!process.env.GEMINI_API_KEY?.trim()) {
    console.warn("GEMINI_API_KEY missing — pack text will load but embeddings may fail later.");
  }

  const sqlClient = postgres(url, { ssl: "require", prepare: false, max: 1 });
  const db = drizzle(sqlClient);

  console.log(`Pack version: ${STARTER_PACK_VERSION}`);

  const existing = await db
    .select({ id: knowledgeSources.id })
    .from(knowledgeSources)
    .where(
      and(
        isNull(knowledgeSources.firmId),
        sql`${knowledgeSources.versionLabel} like 'lexzim-starter-pack-%'`,
      ),
    );

  let embeddingsDeleted = 0;
  for (const row of existing) {
    const oldChunks = await db
      .select({ id: knowledgeChunks.id })
      .from(knowledgeChunks)
      .where(eq(knowledgeChunks.sourceId, row.id));
    const chunkIds = oldChunks.map((c) => c.id);
    if (chunkIds.length > 0) {
      const deleted = await db
        .delete(aiEmbeddings)
        .where(
          and(
            eq(aiEmbeddings.ownerType, "knowledge_chunk"),
            inArray(aiEmbeddings.ownerId, chunkIds),
          ),
        )
        .returning({ id: aiEmbeddings.id });
      embeddingsDeleted += deleted.length;
    }
    await db.delete(knowledgeChunks).where(eq(knowledgeChunks.sourceId, row.id));
    await db.delete(knowledgeSources).where(eq(knowledgeSources.id, row.id));
  }

  let chunksWritten = 0;
  const now = new Date();

  for (const source of STARTER_KB_SOURCES) {
    const combined = source.chunks.map((c) => `${c.headingPath}\n${c.text}`).join("\n\n");
    const contentHash = hashText(`${STARTER_PACK_VERSION}:${source.key}:${combined}`);

    const [created] = await db
      .insert(knowledgeSources)
      .values({
        firmId: null,
        title: source.title,
        sourceType: source.sourceType,
        citationLabel: source.citationLabel,
        jurisdiction: "Zimbabwe",
        publisher: source.publisher,
        sourceUrl: source.sourceUrl,
        licenseNote: source.licenseNote,
        versionLabel: STARTER_PACK_VERSION,
        effectiveDate: source.effectiveDate,
        ingestedAt: now,
        contentHash,
        isActive: true,
        updatedAt: now,
      })
      .returning();

    let chunkIndex = 0;
    for (const section of source.chunks) {
      for (const window of chunkWindows(section.headingPath, section.text)) {
        await db.insert(knowledgeChunks).values({
          sourceId: created!.id,
          firmId: null,
          chunkIndex,
          headingPath: window.headingPath,
          text: window.text,
          tokenEstimate: window.tokenEstimate,
          metadataJson: {
            packVersion: STARTER_PACK_VERSION,
            sourceKey: source.key,
            quality: "starter_demo",
          },
        });
        chunkIndex += 1;
        chunksWritten += 1;
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        packVersion: STARTER_PACK_VERSION,
        sourcesRemoved: existing.length,
        sourcesUpserted: STARTER_KB_SOURCES.length,
        chunksWritten,
        embeddingsDeleted,
      },
      null,
      2,
    ),
  );

  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (!geminiKey) {
    console.warn("Skip embed: GEMINI_API_KEY missing. Run Settings → Knowledge → Re-ingest.");
    await sqlClient.end({ timeout: 5 });
    return;
  }

  const MODEL = "gemini-embedding-001";
  const DIMS = 768;
  const chunks = await db
    .select({
      id: knowledgeChunks.id,
      text: knowledgeChunks.text,
      headingPath: knowledgeChunks.headingPath,
    })
    .from(knowledgeChunks)
    .where(isNull(knowledgeChunks.firmId));

  let embedded = 0;
  let failed = 0;
  for (const chunk of chunks) {
    const payload = [chunk.headingPath, chunk.text].filter(Boolean).join("\n\n");
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:embedContent?key=${encodeURIComponent(geminiKey)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: `models/${MODEL}`,
          content: { parts: [{ text: payload }] },
          outputDimensionality: DIMS,
        }),
      });
      if (!res.ok) {
        failed += 1;
        console.warn(`embed fail ${chunk.id}: HTTP ${res.status}`);
        continue;
      }
      const body = (await res.json()) as { embedding?: { values?: number[] } };
      const embedding = body.embedding?.values ?? [];
      if (embedding.length === 0) {
        failed += 1;
        continue;
      }
      await db
        .insert(aiEmbeddings)
        .values({
          ownerType: "knowledge_chunk",
          ownerId: chunk.id,
          firmId: null,
          embedding,
          modelName: MODEL,
        })
        .onConflictDoUpdate({
          target: [
            aiEmbeddings.ownerType,
            aiEmbeddings.ownerId,
            aiEmbeddings.modelName,
          ],
          set: {
            embedding,
            createdAt: new Date(),
          },
        });
      embedded += 1;
    } catch (err) {
      failed += 1;
      console.warn(`embed fail ${chunk.id}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(JSON.stringify({ embedded, failed, model: MODEL }, null, 2));
  await sqlClient.end({ timeout: 5 });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
