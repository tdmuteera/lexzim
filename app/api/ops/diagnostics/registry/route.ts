import { jsonError, jsonOk } from "@/lib/auth/http";
import { getModuleRegistry } from "@/lib/diagnostics/registry";
import { requireOpsAccess } from "@/lib/platform/ops-guard";

/** GET /api/ops/diagnostics/registry — merged nav/API/tables + overlay. */
export async function GET(request: Request) {
  try {
    await requireOpsAccess(request);
    return jsonOk(getModuleRegistry(), { request, module: "platform" });
  } catch (err) {
    return jsonError(err, request);
  }
}
