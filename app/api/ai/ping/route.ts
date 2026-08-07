import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AiProviderError } from "@/lib/ai/errors";
import { getProvider } from "@/lib/ai/providers";
import { recordAiUsageEvent } from "@/lib/repos/ai-usage";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

/**
 * Managing Partner / AI settings: tiny chat ping through getProvider().
 * No RAG. Never returns key material.
 */
export async function POST(request: Request) {
  try {
    const session = await requirePermission("ai.manage_settings");
    const firmId = tenantFirmId(session);
    const provider = await getProvider(firmId);

    try {
      const result = await provider.chat(
        [{ role: "user", content: "Reply with the single word PONG." }],
        { maxOutputTokens: 8, temperature: 0 },
      );

      await recordAiUsageEvent({
        firmId,
        userId: session.id,
        provider: result.provider,
        model: result.model,
        mode: "dev_ping",
        success: true,
        latencyMs: result.latencyMs,
      });

      await writeAuditLog({
        action: "ai.dev_ping",
        firmId,
        userId: session.id,
        entityType: "ai_provider",
        entityId: result.provider,
        metadata: {
          provider: result.provider,
          model: result.model,
          latencyMs: result.latencyMs,
          replyPreview: result.text.slice(0, 40),
        },
        ipOrUserAgent: clientInfo(request),
      });

      return jsonOk({
        ok: true,
        provider: result.provider,
        model: result.model,
        latencyMs: result.latencyMs,
        reply: result.text.slice(0, 80),
      });
    } catch (err) {
      const code = err instanceof AiProviderError ? err.code : "provider_error";
      const message = err instanceof Error ? err.message : "Ping failed.";

      await recordAiUsageEvent({
        firmId,
        userId: session.id,
        provider: provider.id,
        model: provider.defaultChatModel,
        mode: "dev_ping",
        success: false,
        errorCode: code,
      });

      await writeAuditLog({
        action: "ai.dev_ping",
        firmId,
        userId: session.id,
        entityType: "ai_provider",
        entityId: provider.id,
        metadata: {
          provider: provider.id,
          success: false,
          errorCode: code,
        },
        ipOrUserAgent: clientInfo(request),
      });

      return jsonOk({
        ok: false,
        provider: provider.id,
        model: provider.defaultChatModel,
        errorCode: code,
        message,
      });
    }
  } catch (err) {
    return jsonError(err);
  }
}
