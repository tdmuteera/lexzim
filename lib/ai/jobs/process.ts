/**
 * Process AI jobs by calling existing embed/reindex helpers.
 * Does not change RAG grounding or retrieval rules.
 */
import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { aiJobs } from "@/lib/db/schema";
import {
  firmMemoryReindexAll,
  firmMemoryReindexMatter,
} from "@/lib/ai/firm-memory";
import type { AiJobType } from "@/lib/ai/jobs/types";
import {
  embedSystemKnowledgeChunks,
  kbReingestAll,
} from "@/lib/repos/knowledge";

async function claimNextPendingJob() {
  const db = getDb();
  const pending = await db
    .select()
    .from(aiJobs)
    .where(eq(aiJobs.status, "pending"))
    .orderBy(asc(aiJobs.createdAt))
    .limit(1);
  const job = pending[0];
  if (!job) return null;

  const claimed = await db
    .update(aiJobs)
    .set({ status: "running", startedAt: new Date() })
    .where(and(eq(aiJobs.id, job.id), eq(aiJobs.status, "pending")))
    .returning();
  return claimed[0] ?? null;
}

async function runJobPayload(job: typeof aiJobs.$inferSelect) {
  const type = job.jobType as AiJobType;
  const payload = (job.payloadJson ?? {}) as Record<string, unknown>;
  const firmId = job.firmId;

  switch (type) {
    case "kb_embed": {
      if (!firmId) throw new Error("firmId required for kb_embed provider routing.");
      return embedSystemKnowledgeChunks({ firmIdForProvider: firmId });
    }
    case "kb_reingest_all": {
      if (!firmId) throw new Error("firmId required for kb_reingest_all.");
      return kbReingestAll(firmId);
    }
    case "firm_memory_reindex_all": {
      if (!firmId) throw new Error("firmId required for firm_memory_reindex_all.");
      return firmMemoryReindexAll({ firmId });
    }
    case "firm_memory_reindex_matter": {
      if (!firmId) throw new Error("firmId required.");
      const matterId =
        typeof payload.matterId === "string" ? payload.matterId.trim() : "";
      if (!matterId) throw new Error("matterId required in payload.");
      return firmMemoryReindexMatter({ firmId, matterId });
    }
    default:
      throw new Error(`Unknown job type: ${job.jobType}`);
  }
}

export async function processAiJobById(jobId: string) {
  const db = getDb();
  const rows = await db.select().from(aiJobs).where(eq(aiJobs.id, jobId)).limit(1);
  const job = rows[0];
  if (!job) return null;
  if (job.status !== "pending" && job.status !== "running") return job;

  if (job.status === "pending") {
    await db
      .update(aiJobs)
      .set({ status: "running", startedAt: new Date() })
      .where(and(eq(aiJobs.id, jobId), eq(aiJobs.status, "pending")));
  }

  try {
    const result = await runJobPayload(job);
    const updated = await db
      .update(aiJobs)
      .set({
        status: "completed",
        resultJson: result as unknown as Record<string, unknown>,
        finishedAt: new Date(),
        errorMessage: null,
      })
      .where(eq(aiJobs.id, jobId))
      .returning();
    return updated[0] ?? null;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Job failed";
    const updated = await db
      .update(aiJobs)
      .set({
        status: "failed",
        errorMessage: message.slice(0, 2000),
        finishedAt: new Date(),
      })
      .where(eq(aiJobs.id, jobId))
      .returning();
    return updated[0] ?? null;
  }
}

/** Claim and process one pending job. Returns null if queue empty. */
export async function processNextAiJob() {
  const job = await claimNextPendingJob();
  if (!job) return null;
  return processAiJobById(job.id);
}

/**
 * After enqueue on the web dyno: process this job in the background so pilots
 * work without a separate worker. Dedicated workers should also poll.
 */
export function kickAiJobInBackground(jobId: string): void {
  void processAiJobById(jobId).catch((err) => {
    console.error("[ai-jobs] background process failed", jobId, err);
  });
}

/** Recover jobs stuck in running longer than N minutes (crash). */
export async function requeueStaleRunningJobs(staleMinutes = 45) {
  const db = getDb();
  await db
    .update(aiJobs)
    .set({ status: "pending", startedAt: null, errorMessage: "requeued_stale" })
    .where(
      and(
        eq(aiJobs.status, "running"),
        sql`${aiJobs.startedAt} < now() - make_interval(mins => ${staleMinutes})`,
      ),
    );
}

/**
 * Safe requeue by id: only failed or running jobs → pending.
 * Does not touch trust, fees, or arbitrary SQL.
 */
export async function requeueAiJobById(jobId: string): Promise<{
  ok: boolean;
  previousStatus: string | null;
  message: string;
}> {
  const id = jobId.trim();
  if (!id) {
    return { ok: false, previousStatus: null, message: "job_id is required." };
  }
  const db = getDb();
  const rows = await db.select().from(aiJobs).where(eq(aiJobs.id, id)).limit(1);
  const job = rows[0];
  if (!job) {
    return { ok: false, previousStatus: null, message: "AI job not found." };
  }
  if (job.status !== "failed" && job.status !== "running") {
    return {
      ok: false,
      previousStatus: job.status,
      message: `Job status ${job.status} cannot be requeued (only failed or running).`,
    };
  }
  await db
    .update(aiJobs)
    .set({
      status: "pending",
      startedAt: null,
      finishedAt: null,
      errorMessage: "requeued_by_ops_diagnostics",
    })
    .where(eq(aiJobs.id, id));
  return {
    ok: true,
    previousStatus: job.status,
    message: `AI job requeued from ${job.status} to pending.`,
  };
}
