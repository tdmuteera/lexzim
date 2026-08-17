import { jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import {
  diagnoseRequest,
  getLatestDiagnosis,
  listDiagnosesForRequest,
} from "@/lib/diagnostics/diagnose";
import { isSaneRequestId } from "@/lib/diagnostics/request-id";
import { requireOpsAccess } from "@/lib/platform/ops-guard";

/**
 * GET /api/ops/diagnostics/diagnose?requestId=...
 * Returns latest diagnosis (and optional history).
 */
export async function GET(request: Request) {
  try {
    await requireOpsAccess(request);
    const url = new URL(request.url);
    const requestId = url.searchParams.get("requestId")?.trim() ?? "";
    if (!isSaneRequestId(requestId)) {
      throw new AuthError("validation", "requestId is required.");
    }
    const history = url.searchParams.get("history") === "1";
    if (history) {
      const items = await listDiagnosesForRequest(requestId, 10);
      return jsonOk({ requestId, items }, { request, module: "platform" });
    }
    const latest = await getLatestDiagnosis(requestId);
    return jsonOk({ requestId, diagnosis: latest }, { request, module: "platform" });
  } catch (err) {
    return jsonError(err, request);
  }
}

/**
 * POST /api/ops/diagnostics/diagnose
 * Body: { requestId, includeAi?: boolean }
 * Rules first. AI only when confidence is weak or includeAi is true.
 * Never applies code fixes.
 */
export async function POST(request: Request) {
  try {
    const admin = await requireOpsAccess(request);
    let body: { requestId?: unknown; includeAi?: unknown };
    try {
      body = (await request.json()) as { requestId?: unknown; includeAi?: unknown };
    } catch {
      throw new AuthError("validation", "Invalid JSON body.");
    }
    const requestId =
      typeof body.requestId === "string" ? body.requestId.trim() : "";
    if (!isSaneRequestId(requestId)) {
      throw new AuthError("validation", "requestId is required.");
    }
    const includeAi = body.includeAi === true;
    const result = await diagnoseRequest({
      requestId,
      createdBy: admin.id,
      includeAi,
    });
    return jsonOk(
      {
        ...result,
        note: "Diagnosis only. There is no Apply fix that writes production code.",
      },
      { request, module: "platform" },
    );
  } catch (err) {
    return jsonError(err, request);
  }
}
