/**
 * Enqueue / read AI jobs (P5-09).
 */
import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { aiJobs } from "@/lib/db/schema";
import type { AiJobType } from "@/lib/ai/jobs/types";

export async function enqueueAiJob(input: {
  firmId: string | null;
  jobType: AiJobType;
  payload?: Record<string, unknown>;
  createdByUserId?: string | null;
}) {
  const db = getDb();
  const rows = await db
    .insert(aiJobs)
    .values({
      firmId: input.firmId,
      jobType: input.jobType,
      status: "pending",
      payloadJson: input.payload ?? {},
      createdByUserId: input.createdByUserId ?? null,
    })
    .returning();
  return rows[0];
}

export async function getAiJob(firmId: string | null, jobId: string) {
  const db = getDb();
  const conditions = [eq(aiJobs.id, jobId)];
  if (firmId) conditions.push(eq(aiJobs.firmId, firmId));
  const rows = await db
    .select()
    .from(aiJobs)
    .where(and(...conditions))
    .limit(1);
  return rows[0] ?? null;
}

export async function listRecentAiJobs(firmId: string, limit = 10) {
  const db = getDb();
  return db
    .select()
    .from(aiJobs)
    .where(eq(aiJobs.firmId, firmId))
    .orderBy(desc(aiJobs.createdAt))
    .limit(limit);
}

export function serializeAiJob(row: typeof aiJobs.$inferSelect) {
  return {
    id: row.id,
    firmId: row.firmId,
    jobType: row.jobType,
    status: row.status,
    payload: row.payloadJson ?? {},
    result: row.resultJson ?? null,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
  };
}
