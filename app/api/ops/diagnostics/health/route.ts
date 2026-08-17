import { jsonError, jsonOk } from "@/lib/auth/http";
import { recordEvent } from "@/lib/diagnostics/events";
import { collectOpsDiagnosticHealth } from "@/lib/diagnostics/health";
import { requestIdFromRequest } from "@/lib/diagnostics/request-id";
import { requireOpsAccess } from "@/lib/platform/ops-guard";

/**
 * GET /api/ops/diagnostics/health
 * Aggregated ops health board. No auto-repair. No secrets.
 */
export async function GET(request: Request) {
  try {
    await requireOpsAccess(request);
    const requestId = requestIdFromRequest(request);
    const snapshot = await collectOpsDiagnosticHealth(request);
    const failing = snapshot.checks.filter((c) => !c.ok).map((c) => c.name);

    void recordEvent({
      requestId,
      source: "health",
      level: snapshot.ok ? "info" : "warn",
      module: "platform",
      route: "/api/ops/diagnostics/health",
      httpMethod: "GET",
      httpStatus: 200,
      errorCode: snapshot.ok ? null : "health.degraded",
      messageSafe: snapshot.ok
        ? "Ops health snapshot ok."
        : `Ops health degraded: ${failing.join(", ") || "unknown"}`,
      payload: {
        ok: snapshot.ok,
        failing,
        checkCount: snapshot.checks.length,
      },
    });

    return jsonOk(
      {
        ok: snapshot.ok,
        timestamp: new Date().toISOString(),
        checks: snapshot.checks,
        env: snapshot.fast.env,
        version: snapshot.fast.version,
        circuit: snapshot.fast.circuit,
        db: snapshot.db,
        platform: {
          note: "Firm/licence counts remain on GET /api/platform/health.",
        },
      },
      { request, module: "platform" },
    );
  } catch (err) {
    return jsonError(err, request);
  }
}
