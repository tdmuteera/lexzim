import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import {
  isRuntimeHealAction,
  listRecentRuntimeRepairs,
  proposeOrExecuteRuntimeHeal,
  RUNTIME_HEAL_ACTIONS,
} from "@/lib/diagnostics/runtime-heal";
import { requireOpsAccess } from "@/lib/platform/ops-guard";

/**
 * GET /api/ops/diagnostics/repair/runtime
 * Allowlist + recent runtime repair rows.
 */
export async function GET(request: Request) {
  try {
    await requireOpsAccess(request);
    const items = await listRecentRuntimeRepairs(15);
    return jsonOk(
      {
        allowlist: RUNTIME_HEAL_ACTIONS,
        forbidden: [
          "DROP/ALTER/DELETE on business tables",
          "trust or fee posting",
          "password changes",
          "source edits",
          "arbitrary SQL",
        ],
        items,
      },
      { request, module: "platform" },
    );
  } catch (err) {
    return jsonError(err, request);
  }
}

/**
 * POST /api/ops/diagnostics/repair/runtime
 * Body: { action_code, diagnosis_id?, job_id?, repair_id?, confirm?: boolean }
 * Two-step: omit confirm or confirm=false → proposed; confirm=true → execute.
 */
export async function POST(request: Request) {
  try {
    const admin = await requireOpsAccess(request);
    let body: {
      action_code?: unknown;
      actionCode?: unknown;
      diagnosis_id?: unknown;
      diagnosisId?: unknown;
      job_id?: unknown;
      jobId?: unknown;
      repair_id?: unknown;
      repairId?: unknown;
      confirm?: unknown;
    };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      throw new AuthError("validation", "Invalid JSON body.");
    }

    const actionCode = String(body.action_code ?? body.actionCode ?? "").trim();
    if (!actionCode) {
      throw new AuthError("validation", "action_code is required.");
    }
    if (!isRuntimeHealAction(actionCode)) {
      throw new AuthError(
        "validation",
        `Arbitrary action_code rejected. Allowlist: ${RUNTIME_HEAL_ACTIONS.join(", ")}.`,
      );
    }

    const diagnosisIdRaw = body.diagnosis_id ?? body.diagnosisId;
    const jobIdRaw = body.job_id ?? body.jobId;
    const repairIdRaw = body.repair_id ?? body.repairId;
    const confirm = body.confirm === true;

    const result = await proposeOrExecuteRuntimeHeal({
      actionCode,
      diagnosisId:
        typeof diagnosisIdRaw === "string" ? diagnosisIdRaw.trim() : null,
      jobId: typeof jobIdRaw === "string" ? jobIdRaw.trim() : null,
      repairId: typeof repairIdRaw === "string" ? repairIdRaw.trim() : null,
      confirm,
      actorUserId: admin.id,
      request,
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk(
      {
        ...result,
        note: "Runtime heal only. Trust ledgers and fee posts cannot be touched from this API.",
      },
      { request, module: "platform" },
    );
  } catch (err) {
    return jsonError(err, request);
  }
}
