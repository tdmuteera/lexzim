import { jsonError } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { contentDispositionAttachment, getAiDraft } from "@/lib/ai/draft-store";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type PageProps = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

/** Download a Word draft produced in chat (durable storage, not RAM-only). */
export async function GET(request: Request, { params }: PageProps) {
  try {
    const session = await requirePermission("ai.use");
    const { id } = await params;
    if (!id?.trim()) {
      throw new AuthError("validation", "Draft id is required.");
    }
    const draft = await getAiDraft(id.trim(), tenantFirmId(session), session.id);
    if (!draft) {
      throw new AuthError(
        "not_found",
        "That draft is no longer available. Ask LexZim again for a Word file.",
      );
    }
    return new Response(new Uint8Array(draft.bytes), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": contentDispositionAttachment(draft.fileName),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    return jsonError(err, request);
  }
}
