/**
 * AI usage event stubs (P2-01). Never log API keys.
 */
import { getDb } from "@/lib/db";
import { aiUsageEvents } from "@/lib/db/schema";

export async function recordAiUsageEvent(input: {
  firmId: string;
  userId?: string | null;
  provider: string;
  model?: string | null;
  mode?: string | null;
  success: boolean;
  errorCode?: string | null;
  latencyMs?: number | null;
}) {
  const db = getDb();
  const rows = await db
    .insert(aiUsageEvents)
    .values({
      firmId: input.firmId,
      userId: input.userId ?? null,
      provider: input.provider,
      model: input.model ?? null,
      mode: input.mode ?? null,
      success: input.success,
      errorCode: input.errorCode ?? null,
      latencyMs: input.latencyMs ?? null,
    })
    .returning();
  return rows[0];
}
