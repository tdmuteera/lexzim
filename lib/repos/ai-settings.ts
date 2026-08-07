/**
 * AI settings repository stubs (P2-01).
 * Keys are never stored here — see P2-02.
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { aiSettings } from "@/lib/db/schema";

export async function getAiSettings(firmId: string) {
  const db = getDb();
  const rows = await db.select().from(aiSettings).where(eq(aiSettings.firmId, firmId)).limit(1);
  return rows[0] ?? null;
}

export async function upsertAiSettings(
  firmId: string,
  input: {
    providerDefault?: string;
    modelDefault?: string;
    embeddingsModel?: string;
    webLookupEnabled?: boolean;
  },
) {
  const db = getDb();
  const existing = await getAiSettings(firmId);
  if (!existing) {
    const rows = await db
      .insert(aiSettings)
      .values({
        firmId,
        providerDefault: input.providerDefault ?? "gemini",
        modelDefault: input.modelDefault ?? "gemini-2.0-flash",
        embeddingsModel: input.embeddingsModel ?? "text-embedding-004",
        webLookupEnabled: input.webLookupEnabled ?? false,
        updatedAt: new Date(),
      })
      .returning();
    return rows[0];
  }

  const rows = await db
    .update(aiSettings)
    .set({
      providerDefault: input.providerDefault ?? existing.providerDefault,
      modelDefault: input.modelDefault ?? existing.modelDefault,
      embeddingsModel: input.embeddingsModel ?? existing.embeddingsModel,
      webLookupEnabled:
        input.webLookupEnabled !== undefined
          ? input.webLookupEnabled
          : existing.webLookupEnabled,
      updatedAt: new Date(),
    })
    .where(eq(aiSettings.firmId, firmId))
    .returning();
  return rows[0];
}
