/**
 * Persist redacted diagnostic events (P8-04).
 * Failures here must never fail the user request.
 */
import "server-only";

import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  diagnosticEvents,
  diagnosticSpans,
} from "@/lib/db/schema";
import type {
  DiagnosticEventLevel,
  DiagnosticEventSource,
} from "@/lib/db/diagnostics-types";
import { logWarn } from "@/lib/ops/log";
import {
  redactDiagnosticMessage,
  redactDiagnosticPayload,
  sanitizeRoutePath,
} from "@/lib/diagnostics/redact";

export type RecordDiagnosticEventInput = {
  requestId: string;
  source?: DiagnosticEventSource | string;
  level: DiagnosticEventLevel | string;
  module: string;
  route?: string | null;
  httpMethod?: string | null;
  httpStatus?: number | null;
  errorCode?: string | null;
  sqlstate?: string | null;
  messageSafe?: string | null;
  userId?: string | null;
  firmId?: string | null;
  role?: string | null;
  durationMs?: number | null;
  payload?: Record<string, unknown> | null;
};

/** Sample rate for noisy info-level events (0 to 1). */
const INFO_SAMPLE_RATE = Number(process.env.DIAGNOSTICS_INFO_SAMPLE_RATE ?? "0.05");

export function shouldPersistLevel(
  level: string,
  errorCode?: string | null,
): boolean {
  if (level === "error" || level === "warn") return true;
  if (
    errorCode === "runtime_heal.ok" ||
    errorCode === "runtime_heal.health_degraded" ||
    errorCode === "health.degraded" ||
    errorCode === "health.recheck.ok" ||
    errorCode === "patch_proposal.created" ||
    errorCode === "patch_proposal.verified" ||
    errorCode === "patch_proposal.verify_failed"
  ) {
    return true;
  }
  if (errorCode === "invalid_credentials" || errorCode === "weak_password") {
    return false;
  }
  if (level === "info" || level === "debug") {
    const rate = Number.isFinite(INFO_SAMPLE_RATE) ? INFO_SAMPLE_RATE : 0.05;
    if (rate <= 0) return false;
    if (rate >= 1) return true;
    return Math.random() < rate;
  }
  return true;
}

export async function recordEvent(input: RecordDiagnosticEventInput): Promise<void> {
  try {
    if (!shouldPersistLevel(input.level, input.errorCode)) return;
    if (!input.requestId?.trim()) return;

    const db = getDb();
    await db.insert(diagnosticEvents).values({
      requestId: input.requestId.trim().slice(0, 64),
      source: (input.source ?? "api").slice(0, 32),
      level: String(input.level).slice(0, 16),
      module: (input.module || "platform").slice(0, 64),
      route: sanitizeRoutePath(input.route ?? null),
      httpMethod: input.httpMethod?.slice(0, 16) ?? null,
      httpStatus: input.httpStatus ?? null,
      errorCode: input.errorCode?.slice(0, 64) ?? null,
      sqlstate: input.sqlstate?.slice(0, 16) ?? null,
      messageSafe: redactDiagnosticMessage(input.messageSafe),
      userId: input.userId ?? null,
      firmId: input.firmId ?? null,
      role: input.role?.slice(0, 64) ?? null,
      durationMs: input.durationMs ?? null,
      payloadJson: redactDiagnosticPayload(input.payload ?? {}),
    });
  } catch (err) {
    logWarn("diagnostics.recordEvent", "Failed to persist diagnostic event", {
      error: err instanceof Error ? err.message : String(err),
      requestId: input.requestId?.slice(0, 64),
    });
  }
}

export type RecordSpanInput = {
  requestId: string;
  name: string;
  parentSpanId?: string | null;
  durationMs?: number | null;
  ok?: boolean;
  errorCode?: string | null;
  startedAt?: Date;
};

/** Span names only (e.g. db.query.users). Never SQL text or binds. */
export async function recordSpan(input: RecordSpanInput): Promise<void> {
  try {
    if (!input.requestId?.trim() || !input.name?.trim()) return;
    const db = getDb();
    await db.insert(diagnosticSpans).values({
      requestId: input.requestId.trim().slice(0, 64),
      parentSpanId: input.parentSpanId ?? null,
      name: input.name.trim().slice(0, 120),
      startedAt: input.startedAt ?? new Date(),
      durationMs: input.durationMs ?? null,
      ok: input.ok ?? true,
      errorCode: input.errorCode?.slice(0, 64) ?? null,
    });
  } catch (err) {
    logWarn("diagnostics.recordSpan", "Failed to persist diagnostic span", {
      error: err instanceof Error ? err.message : String(err),
      requestId: input.requestId?.slice(0, 64),
    });
  }
}

export async function listEventsByRequestId(requestId: string) {
  const db = getDb();
  const id = requestId.trim().slice(0, 64);
  const [events, spans] = await Promise.all([
    db
      .select()
      .from(diagnosticEvents)
      .where(eq(diagnosticEvents.requestId, id))
      .orderBy(desc(diagnosticEvents.createdAt))
      .limit(200),
    db
      .select()
      .from(diagnosticSpans)
      .where(eq(diagnosticSpans.requestId, id))
      .orderBy(desc(diagnosticSpans.startedAt))
      .limit(200),
  ]);

  return {
    requestId: id,
    events: events.map((e) => ({
      id: e.id,
      requestId: e.requestId,
      createdAt: e.createdAt.toISOString(),
      source: e.source,
      level: e.level,
      module: e.module,
      route: e.route,
      httpMethod: e.httpMethod,
      httpStatus: e.httpStatus,
      errorCode: e.errorCode,
      sqlstate: e.sqlstate,
      messageSafe: e.messageSafe,
      userId: e.userId,
      firmId: e.firmId,
      role: e.role,
      durationMs: e.durationMs,
      payload: redactDiagnosticPayload(
        (e.payloadJson as Record<string, unknown> | null) ?? {},
      ),
    })),
    spans: spans.map((s) => ({
      id: s.id,
      requestId: s.requestId,
      parentSpanId: s.parentSpanId,
      name: s.name,
      startedAt: s.startedAt.toISOString(),
      durationMs: s.durationMs,
      ok: s.ok,
      errorCode: s.errorCode,
    })),
  };
}
