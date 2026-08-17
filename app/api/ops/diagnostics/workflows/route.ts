import { jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import {
  assertTrustReceiptNotFeePayment,
  getWorkflowBundle,
  getWorkflowById,
  suggestWorkflows,
} from "@/lib/diagnostics/workflows";
import { requireOpsAccess } from "@/lib/platform/ops-guard";

/**
 * GET /api/ops/diagnostics/workflows
 * Seven v1 workflow contracts + dependency graph.
 * Optional ?route=&module=&method= returns suggested workflows for an event.
 */
export async function GET(request: Request) {
  try {
    await requireOpsAccess(request);
    assertTrustReceiptNotFeePayment();

    const url = new URL(request.url);
    const route = url.searchParams.get("route");
    const moduleCode = url.searchParams.get("module");
    const method = url.searchParams.get("method");
    const workflowId = url.searchParams.get("id");

    if (workflowId) {
      const one = getWorkflowById(workflowId);
      if (!one) {
        throw new AuthError("not_found", "Unknown workflow id.");
      }
      return jsonOk({ workflow: one }, { request, module: "platform" });
    }

    const bundle = getWorkflowBundle();
    const suggested =
      route || moduleCode || method
        ? suggestWorkflows({ route, module: moduleCode, method })
        : undefined;

    return jsonOk(
      {
        ...bundle,
        ...(suggested
          ? { suggested: suggested.map((w) => w.id), suggestedWorkflows: suggested }
          : {}),
      },
      { request, module: "platform" },
    );
  } catch (err) {
    return jsonError(err, request);
  }
}
