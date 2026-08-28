/**
 * AI settings repository. Keys are never stored here — see secrets.ts.
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { aiSettings } from "@/lib/db/schema";

export type AiRoutingMode = "auto" | "manual";
export type AiKeyMode = "direct" | "proxy";

const DEFAULT_MAX_OUTPUT_TOKENS = 3600;

export function normalizeRoutingMode(raw: string | null | undefined): AiRoutingMode {
  return raw === "manual" ? "manual" : "auto";
}

export function normalizeKeyMode(raw: string | null | undefined): AiKeyMode {
  return raw === "proxy" ? "proxy" : "direct";
}

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
    routingMode?: AiRoutingMode;
    monthlySoftBudget?: number | null;
    maxOutputTokens?: number;
    matterContextEnabled?: boolean;
    keyMode?: AiKeyMode;
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
        modelDefault: input.modelDefault ?? "gemini-3.6-flash",
        embeddingsModel: input.embeddingsModel ?? "gemini-embedding-001",
        webLookupEnabled: input.webLookupEnabled ?? true,
        routingMode: input.routingMode ?? "auto",
        monthlySoftBudget:
          input.monthlySoftBudget === undefined ? 500 : input.monthlySoftBudget,
        maxOutputTokens: input.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        matterContextEnabled: input.matterContextEnabled ?? true,
        keyMode: input.keyMode ?? "direct",
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
      routingMode:
        input.routingMode !== undefined ? input.routingMode : existing.routingMode,
      monthlySoftBudget:
        input.monthlySoftBudget !== undefined
          ? input.monthlySoftBudget
          : existing.monthlySoftBudget,
      maxOutputTokens:
        input.maxOutputTokens !== undefined
          ? input.maxOutputTokens
          : existing.maxOutputTokens,
      matterContextEnabled:
        input.matterContextEnabled !== undefined
          ? input.matterContextEnabled
          : existing.matterContextEnabled,
      keyMode: input.keyMode !== undefined ? input.keyMode : existing.keyMode,
      updatedAt: new Date(),
    })
    .where(eq(aiSettings.firmId, firmId))
    .returning();
  return rows[0];
}

export { DEFAULT_MAX_OUTPUT_TOKENS };
