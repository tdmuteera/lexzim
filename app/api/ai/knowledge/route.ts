import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AiProviderError } from "@/lib/ai/errors";
import { enqueueAiJob, serializeAiJob } from "@/lib/ai/jobs/enqueue";
import { kickAiJobInBackground } from "@/lib/ai/jobs/process";
import {
  getKnowledgePackStats,
  ingestZimbabweStarterPack,
} from "@/lib/repos/knowledge";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

/** Knowledge pack status (sources, chunks, embeddings). */
export async function GET(request: Request) {
  try {
    await requirePermission("ai.manage_settings");
    const stats = await getKnowledgePackStats();
    return jsonOk(stats);
  } catch (err) {
    return jsonError(err, request);
  }
}

/**
 * Re-ingest knowledge.
 * body.mode:
 * - "all" (default): queue kb_reingest_all (pack + embed)
 * - "pack": text/chunks only (sync; fast)
 * - "embed": queue kb_embed
 * body.async: default true for all/embed; false forces legacy sync (may time out)
 */
export async function POST(request: Request) {
  try {
    const session = await requirePermission("ai.manage_settings");
    const firmId = tenantFirmId(session);
    const body = (await request.json().catch(() => ({}))) as {
      mode?: string;
      async?: boolean;
    };
    const mode = (body.mode ?? "all").trim().toLowerCase();
    const preferAsync = body.async !== false;

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

    if (mode === "embed" || mode === "all") {
      if (preferAsync) {
        const jobType = mode === "embed" ? "kb_embed" : "kb_reingest_all";
        const job = await enqueueAiJob({
          firmId,
          jobType,
          createdByUserId: session.id,
          payload: { mode },
        });
        await writeAuditLog({
          action: mode === "embed" ? "ai.kb_embed_queued" : "ai.kb_reingest_all_queued",
          firmId,
          userId: session.id,
          entityType: "ai_job",
          entityId: job.id,
          metadata: { mode, jobType },
          ipOrUserAgent: clientInfo(request),
        });
        kickAiJobInBackground(job.id);
        return jsonOk(
          {
            mode,
            async: true,
            job: serializeAiJob(job),
            message:
              "Job queued. Poll GET /api/ai/jobs/{id}. Worker: npm run jobs:ai (optional dedicated Railway service).",
          },
          { status: 202 },
        );
      }
    }

    // Legacy sync path (async: false) — may hit web timeouts on large packs.
    const { embedSystemKnowledgeChunks, kbReingestAll } = await import(
      "@/lib/repos/knowledge"
    );

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
          async: false,
        },
        ipOrUserAgent: clientInfo(request),
      });
      const stats = await getKnowledgePackStats();
      return jsonOk({ mode, result, stats, async: false });
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
        async: false,
      },
      ipOrUserAgent: clientInfo(request),
    });

    const stats = await getKnowledgePackStats();
    return jsonOk({ mode: "all", result, stats, async: false });
  } catch (err) {
    if (err instanceof AiProviderError) {
      return jsonError(err, request);
    }
    return jsonError(err, request);
  }
}
