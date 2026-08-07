import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AiProviderError } from "@/lib/ai/errors";
import {
  embedSystemKnowledgeChunks,
  getKnowledgePackStats,
  ingestZimbabweStarterPack,
  kbReingestAll,
} from "@/lib/repos/knowledge";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

/** Knowledge pack status (sources, chunks, embeddings). */
export async function GET() {
  try {
    await requirePermission("ai.manage_settings");
    const stats = await getKnowledgePackStats();
    return jsonOk(stats);
  } catch (err) {
    return jsonError(err);
  }
}

/**
 * Re-ingest knowledge.
 * body.mode:
 * - "all" (default): reload starter pack + embed (kb_reingest)
 * - "pack": text/chunks only
 * - "embed": embed existing system chunks only (kb_ingest_all embeddings)
 */
export async function POST(request: Request) {
  try {
    const session = await requirePermission("ai.manage_settings");
    const firmId = tenantFirmId(session);
    const body = (await request.json().catch(() => ({}))) as { mode?: string };
    const mode = (body.mode ?? "all").trim().toLowerCase();

    if (mode === "pack") {
      const result = await ingestZimbabweStarterPack();
      await writeAuditLog({
        action: "ai.kb_reingest_starter",
        firmId,
        userId: session.id,
        entityType: "knowledge_pack",
        entityId: result.packVersion,
        metadata: {
          mode: "pack",
          sourcesUpserted: result.sourcesUpserted,
          chunksWritten: result.chunksWritten,
          embeddingsDeleted: result.embeddingsDeleted,
        },
        ipOrUserAgent: clientInfo(request),
      });
      const stats = await getKnowledgePackStats();
      return jsonOk({ mode, result, stats });
    }

    if (mode === "embed") {
      const result = await embedSystemKnowledgeChunks({ firmIdForProvider: firmId });
      await writeAuditLog({
        action: "ai.kb_embed",
        firmId,
        userId: session.id,
        entityType: "knowledge_pack",
        entityId: result.modelName,
        metadata: {
          mode: "embed",
          embedded: result.embedded,
          failed: result.failed,
          errorCode: result.errorCode ?? null,
        },
        ipOrUserAgent: clientInfo(request),
      });
      const stats = await getKnowledgePackStats();
      return jsonOk({ mode, result, stats });
    }

    const result = await kbReingestAll(firmId);
    await writeAuditLog({
      action: "ai.kb_reingest_all",
      firmId,
      userId: session.id,
      entityType: "knowledge_pack",
      entityId: result.pack.packVersion,
      metadata: {
        mode: "all",
        sourcesUpserted: result.pack.sourcesUpserted,
        chunksWritten: result.pack.chunksWritten,
        embedded: result.embeddings.embedded,
        embedFailed: result.embeddings.failed,
        embedErrorCode: result.embeddings.errorCode ?? null,
        steps: result.steps,
      },
      ipOrUserAgent: clientInfo(request),
    });

    const stats = await getKnowledgePackStats();
    return jsonOk({ mode: "all", result, stats });
  } catch (err) {
    if (err instanceof AiProviderError) {
      return jsonError(err);
    }
    return jsonError(err);
  }
}
