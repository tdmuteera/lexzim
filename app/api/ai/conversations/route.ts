import { jsonError, jsonOk } from "@/lib/auth/http";
import { listConversations } from "@/lib/repos/ai-conversations";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

/** List the signed-in user's AI conversations (default: legal_research). */
export async function GET(request: Request) {
  try {
    const session = await requirePermission("ai.use");
    const firmId = tenantFirmId(session);
    const url = new URL(request.url);
    const mode = url.searchParams.get("mode") ?? "legal_research";

    const rows = await listConversations(firmId, session.id, { mode });
    return jsonOk({
      items: rows.map((c) => ({
        id: c.id,
        mode: c.mode,
        title: c.title,
        matterId: c.matterId,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      })),
    });
  } catch (err) {
    return jsonError(err);
  }
}
