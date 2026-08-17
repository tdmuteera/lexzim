import { and, desc, eq, gte } from "drizzle-orm";
import { jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { listEventsByRequestId } from "@/lib/diagnostics/events";
import { isSaneRequestId } from "@/lib/diagnostics/request-id";
import { redactDiagnosticPayload } from "@/lib/diagnostics/redact";
import { getDb } from "@/lib/db";
import { diagnosticEvents } from "@/lib/db/schema";
import { requireOpsAccess } from "@/lib/platform/ops-guard";

/**
 * GET /api/ops/diagnostics/events?requestId=...
 * Optional filters without requestId: module, level, limit (last 24h).
 * Platform ops only. Payloads re-redacted on read.
 */
export async function GET(request: Request) {
  try {
    await requireOpsAccess(request);
    const url = new URL(request.url);
    const requestId = url.searchParams.get("requestId")?.trim() ?? "";
    const moduleFilter = url.searchParams.get("module")?.trim() || null;
    const levelFilter = url.searchParams.get("level")?.trim() || null;
    const hoursRaw = Number(url.searchParams.get("hours") ?? "24");
    const hours = [1, 24, 72, 168].includes(hoursRaw) ? hoursRaw : 24;
    const limitRaw = Number(url.searchParams.get("limit") ?? "50");
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(Math.floor(limitRaw), 1), 200)
      : 50;

    if (requestId) {
      if (!isSaneRequestId(requestId)) {
        throw new AuthError("validation", "Invalid requestId.");
      }
      const timeline = await listEventsByRequestId(requestId);
      return jsonOk(timeline, { request, module: "platform" });
    }

    const db = getDb();
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const conditions = [gte(diagnosticEvents.createdAt, since)];
    if (moduleFilter) conditions.push(eq(diagnosticEvents.module, moduleFilter));
    if (levelFilter) conditions.push(eq(diagnosticEvents.level, levelFilter));

    const rows = await db
      .select()
      .from(diagnosticEvents)
      .where(and(...conditions))
      .orderBy(desc(diagnosticEvents.createdAt))
      .limit(limit);

    return jsonOk(
      {
        windowHours: hours,
        items: rows.map((e) => ({
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
          firmId: e.firmId,
          role: e.role,
          durationMs: e.durationMs,
          payload: redactDiagnosticPayload(
            (e.payloadJson as Record<string, unknown> | null) ?? {},
          ),
        })),
        note: "Pass requestId for a full timeline with spans.",
      },
      { request, module: "platform" },
    );
  } catch (err) {
    return jsonError(err, request);
  }
}
