import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { aiTestProvider } from "@/lib/ai/test-provider";
import { getAiSettings } from "@/lib/repos/ai-settings";
import { recordAiUsageEvent } from "@/lib/repos/ai-usage";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

/** Tiny Gemini connection test. Audits success/failure without key material. */
export async function POST(request: Request) {
  try {
    const session = await requirePermission("ai.manage_settings");
    const firmId = tenantFirmId(session);
    const settings = await getAiSettings(firmId);
    const model = settings?.modelDefault;

    const result = await aiTestProvider({ firmId, model });

    await recordAiUsageEvent({
      firmId,
      userId: session.id,
      provider: result.provider,
      model: result.model,
      mode: "health_check",
      success: result.status === "connected",
      errorCode: result.errorCode ?? null,
      latencyMs: result.latencyMs,
    });

    await writeAuditLog({
      action: "ai.test_provider",
      firmId,
      userId: session.id,
      entityType: "ai_settings",
      entityId: firmId,
      metadata: {
        status: result.status,
        provider: result.provider,
        model: result.model,
        latencyMs: result.latencyMs,
        errorCode: result.errorCode ?? null,
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({
      status: result.status,
      provider: result.provider,
      model: result.model,
      latencyMs: result.latencyMs,
      message: result.message ?? null,
      errorCode: result.errorCode ?? null,
    });
  } catch (err) {
    return jsonError(err);
  }
}
