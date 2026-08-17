import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import {
  createPatchProposal,
  getPatchProposal,
  listPatchProposals,
  updatePatchProposalStatus,
  type PatchProposalStatus,
} from "@/lib/diagnostics/patch-proposals";
import { requireOpsAccess } from "@/lib/platform/ops-guard";

/**
 * GET /api/ops/diagnostics/repair/propose
 * List proposals, or ?id= for one proposal + markdown body.
 */
export async function GET(request: Request) {
  try {
    await requireOpsAccess(request);
    const url = new URL(request.url);
    const id = url.searchParams.get("id")?.trim();
    if (id) {
      const detail = await getPatchProposal(id);
      return jsonOk(detail, { request, module: "platform" });
    }
    const items = await listPatchProposals(40);
    return jsonOk(
      {
        items,
        note: "Proposals are markdown under docs/diagnostics/proposals/. The app never writes production source.",
      },
      { request, module: "platform" },
    );
  } catch (err) {
    return jsonError(err, request);
  }
}

/**
 * POST /api/ops/diagnostics/repair/propose
 * Body: { title, files[], rationale, requestId?, test_plan, diagnosis_id? }
 */
export async function POST(request: Request) {
  try {
    const admin = await requireOpsAccess(request);
    let body: {
      title?: unknown;
      files?: unknown;
      rationale?: unknown;
      requestId?: unknown;
      request_id?: unknown;
      test_plan?: unknown;
      testPlan?: unknown;
      diagnosis_id?: unknown;
      diagnosisId?: unknown;
    };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      throw new AuthError("validation", "Invalid JSON body.");
    }

    const title = String(body.title ?? "").trim();
    const rationale = String(body.rationale ?? "").trim();
    const testPlan = String(body.test_plan ?? body.testPlan ?? "").trim();
    const filesRaw = body.files;
    const files = Array.isArray(filesRaw)
      ? filesRaw.map((f) => String(f).trim()).filter(Boolean)
      : [];
    const requestIdRaw = body.requestId ?? body.request_id;
    const diagnosisRaw = body.diagnosis_id ?? body.diagnosisId;

    const result = await createPatchProposal({
      title,
      files,
      rationale,
      testPlan,
      requestId: typeof requestIdRaw === "string" ? requestIdRaw.trim() : null,
      diagnosisId: typeof diagnosisRaw === "string" ? diagnosisRaw.trim() : null,
      actorUserId: admin.id,
      ipOrUserAgent: clientInfo(request),
      request,
    });

    return jsonOk(
      {
        ...result,
        note: "Markdown proposal written. Human applies via PR. No src/ write from this API.",
      },
      { request, module: "platform" },
    );
  } catch (err) {
    return jsonError(err, request);
  }
}

/**
 * PATCH /api/ops/diagnostics/repair/propose
 * Body: { id, status: approved | rejected | succeeded | rolled_back }
 * succeeded runs verify subset + health recheck (does not edit source).
 */
export async function PATCH(request: Request) {
  try {
    const admin = await requireOpsAccess(request);
    let body: { id?: unknown; status?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      throw new AuthError("validation", "Invalid JSON body.");
    }

    const id = String(body.id ?? "").trim();
    const status = String(body.status ?? "").trim() as PatchProposalStatus;
    if (!id) throw new AuthError("validation", "id is required.");

    const result = await updatePatchProposalStatus({
      id,
      status,
      actorUserId: admin.id,
      ipOrUserAgent: clientInfo(request),
      request,
    });

    return jsonOk(
      {
        ...result,
        note: "Status updated only. Application source was not modified by LexZim.",
      },
      { request, module: "platform" },
    );
  } catch (err) {
    return jsonError(err, request);
  }
}
