import { jsonError, jsonOk } from "@/lib/auth/http";
import { getAiConnectivityReport } from "@/lib/ai/connectivity";
import { getAiSettings } from "@/lib/repos/ai-settings";
import { getKnowledgePackStats } from "@/lib/repos/knowledge";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

/**
 * AI readiness + optional connectivity probe for the chat UI (ai.use).
 * Never returns API keys.
 * Query: ?probe=1 to verify provider reachability (tiny embed with retries).
 */
export async function GET(request: Request) {
  try {
    const session = await requirePermission("ai.use");
    const firmId = tenantFirmId(session);
    const url = new URL(request.url);
    const probe = url.searchParams.get("probe") === "1";

    const pack = await getKnowledgePackStats();
    const settings = await getAiSettings(firmId);
    const connectivity = await getAiConnectivityReport({ firmId, probe });

    const canSendLegalResearch =
      connectivity.canSendLegalResearch && pack.embeddingsReady;

    let sendBlockedReason = connectivity.sendBlockedReason;
    if (connectivity.canSendLegalResearch && !pack.embeddingsReady) {
      sendBlockedReason =
        pack.systemChunkCount === 0
          ? "Knowledge pack is empty. Re-ingest under Settings → Knowledge pack before Legal Research."
          : "Embeddings are not ready. Embed the knowledge pack after GEMINI_API_KEY is set.";
    }

    return jsonOk({
      keyStatus: connectivity.keyStatus,
      connectivity: connectivity.connectivity,
      probed: connectivity.probed,
      connectivityMessage: connectivity.message,
      packVersion: pack.packVersion,
      quality: pack.quality,
      systemChunkCount: pack.systemChunkCount,
      embeddingCount: pack.embeddingCount ?? 0,
      embeddingsReady: pack.embeddingsReady,
      embeddingsModel: pack.embeddingsModel,
      readyForGroundedAnswers:
        connectivity.connectivity === "ready" && pack.embeddingsReady,
      canSendLegalResearch,
      canSendMatterAssist: connectivity.canSendMatterAssist,
      sendBlockedReason,
      corePracticeNote: connectivity.corePracticeNote,
      webLookupEnabled: Boolean(settings?.webLookupEnabled),
    });
  } catch (err) {
    return jsonError(err);
  }
}
