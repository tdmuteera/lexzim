/**
 * Diagnose a requestId timeline (P8-11). Rules first; optional AI second opinion.
 * Persists diagnostic_diagnoses. Never writes production code or user data.
 */
import "server-only";

import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { isDbCircuitOpen } from "@/lib/db/connectivity";
import { diagnosticDiagnoses } from "@/lib/db/schema";
import type { DiagnosticRecommendedAction } from "@/lib/db/diagnostics-types";
import { requestDiagnosticAiOpinion } from "@/lib/diagnostics/ai-opinion";
import { listEventsByRequestId } from "@/lib/diagnostics/events";
import { getFastHealth } from "@/lib/diagnostics/health";
import { redactDiagnosticPayload } from "@/lib/diagnostics/redact";
import {
  classifyDiagnosticEvidence,
  type RuleHit,
} from "@/lib/diagnostics/rules";

const HIGH_CONFIDENCE = 80;

export type DiagnosisRecord = {
  id: string;
  requestId: string | null;
  createdAt: string;
  summary: string;
  likelyCause: string;
  confidence: number;
  alternatives: unknown[];
  evidence: Record<string, unknown>;
  recommendedAction: string;
  modelId: string | null;
  createdBy: string;
};

function serializeDiagnosis(row: typeof diagnosticDiagnoses.$inferSelect): DiagnosisRecord {
  return {
    id: row.id,
    requestId: row.requestId,
    createdAt: row.createdAt.toISOString(),
    summary: row.summary,
    likelyCause: row.likelyCause,
    confidence: row.confidence,
    alternatives: (row.alternativesJson as unknown[]) ?? [],
    evidence: (row.evidenceJson as Record<string, unknown>) ?? {},
    recommendedAction: row.recommendedAction,
    modelId: row.modelId,
    createdBy: row.createdBy,
  };
}

function buildEvidencePack(input: {
  requestId: string;
  events: Awaited<ReturnType<typeof listEventsByRequestId>>["events"];
  spans: Awaited<ReturnType<typeof listEventsByRequestId>>["spans"];
  circuitOpen: boolean;
  healthOk: boolean;
  rules: { primary: RuleHit | null; hits: RuleHit[]; suggestedWorkflowIds: string[] };
}) {
  return redactDiagnosticPayload({
    requestId: input.requestId,
    circuitOpen: input.circuitOpen,
    healthOk: input.healthOk,
    eventCount: input.events.length,
    spanCount: input.spans.length,
    suggestedWorkflowIds: input.rules.suggestedWorkflowIds,
    rules: input.rules.hits.slice(0, 5).map((h) => ({
      ruleId: h.ruleId,
      causeCode: h.causeCode,
      confidence: h.confidence,
      recommendedAction: h.recommendedAction,
      module: h.module,
    })),
    events: input.events.slice(0, 40).map((e) => ({
      id: e.id,
      source: e.source,
      level: e.level,
      module: e.module,
      route: e.route,
      httpMethod: e.httpMethod,
      httpStatus: e.httpStatus,
      errorCode: e.errorCode,
      sqlstate: e.sqlstate,
      durationMs: e.durationMs,
      messageSafe: e.messageSafe.slice(0, 180),
    })),
    spans: input.spans.slice(0, 20).map((s) => ({
      id: s.id,
      name: s.name,
      ok: s.ok,
      errorCode: s.errorCode,
      durationMs: s.durationMs,
    })),
  });
}

export async function diagnoseRequest(opts: {
  requestId: string;
  createdBy: string;
  /** When rules confidence >= 80, AI is skipped unless this is true. */
  includeAi?: boolean;
}): Promise<{
  diagnosis: DiagnosisRecord;
  rulesOnly: boolean;
  aiUsed: boolean;
}> {
  const requestId = opts.requestId.trim().slice(0, 64);
  const timeline = await listEventsByRequestId(requestId);
  const fast = getFastHealth();
  const circuitOpen = isDbCircuitOpen() || Boolean(fast.circuit.open);

  const classified = classifyDiagnosticEvidence({
    events: timeline.events,
    spans: timeline.spans,
    circuitOpen,
  });

  const evidencePack = buildEvidencePack({
    requestId,
    events: timeline.events,
    spans: timeline.spans,
    circuitOpen,
    healthOk: fast.ok,
    rules: classified,
  });

  const primary = classified.primary;
  const high =
    primary != null && primary.confidence >= HIGH_CONFIDENCE && !opts.includeAi;

  let summary =
    primary?.summary ??
    (timeline.events.length
      ? "No strong rule match for this timeline."
      : "No diagnostic events stored for this request id yet.");
  let likelyCause =
    primary?.likelyCause ??
    "Insufficient evidence. Confirm migration 0025 is applied and reproduce the failure.";
  let confidence = primary?.confidence ?? 20;
  let recommendedAction: DiagnosticRecommendedAction =
    primary?.recommendedAction ?? "inspect_health";
  let alternatives: string[] = primary?.alternatives ?? [
    "Search related events by module",
    "Run ops health board",
  ];
  let modelId: string | null = null;
  let aiUsed = false;

  if (!high) {
    const opinion = await requestDiagnosticAiOpinion({
      evidencePack,
      rulesPrimary: primary,
    });
    if (opinion) {
      aiUsed = true;
      modelId = opinion.modelId;
      // Prefer AI wording but keep rules cause code in evidence; never drop rules trail.
      summary = opinion.summary || summary;
      likelyCause = opinion.likelyCause || likelyCause;
      confidence = Math.max(confidence, opinion.confidence);
      if (opinion.confidence >= confidence - 5) {
        recommendedAction = opinion.recommendedAction;
      }
      alternatives = [
        ...new Set([...(opinion.alternatives ?? []), ...alternatives]),
      ].slice(0, 8);
    }
  }

  const evidenceJson = redactDiagnosticPayload({
    ...evidencePack,
    engine: aiUsed ? "rules+ai" : "rules",
    primaryCauseCode: primary?.causeCode ?? null,
    rulesHits: classified.hits.map((h) => h.ruleId),
    evidenceEventIds: primary?.evidenceEventIds ?? [],
  });

  const db = getDb();
  const [row] = await db
    .insert(diagnosticDiagnoses)
    .values({
      requestId,
      summary: summary.slice(0, 1000),
      likelyCause: likelyCause.slice(0, 2000),
      confidence,
      alternativesJson: alternatives,
      evidenceJson,
      recommendedAction,
      modelId,
      createdBy: opts.createdBy.slice(0, 64) || "rules",
    })
    .returning();

  return {
    diagnosis: serializeDiagnosis(row!),
    rulesOnly: !aiUsed,
    aiUsed,
  };
}

export async function listDiagnosesForRequest(requestId: string, limit = 10) {
  const db = getDb();
  const id = requestId.trim().slice(0, 64);
  const rows = await db
    .select()
    .from(diagnosticDiagnoses)
    .where(eq(diagnosticDiagnoses.requestId, id))
    .orderBy(desc(diagnosticDiagnoses.createdAt))
    .limit(Math.min(Math.max(limit, 1), 50));
  return rows.map(serializeDiagnosis);
}

export async function getLatestDiagnosis(requestId: string) {
  const rows = await listDiagnosesForRequest(requestId, 1);
  return rows[0] ?? null;
}
