import { jsonError } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { getAiDraft } from "@/lib/ai/draft-store";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type PageProps = { params: Promise<{ id: string }> };

/** Download a Word draft produced in chat. */
export async function GET(request: Request, { params }: PageProps) {
  try {
    const session = await requirePermission("ai.use");
    const { id } = await params;
    const draft = getAiDraft(id, tenantFirmId(session), session.id);
    if (!draft) {
      throw new AuthError("not_found", "That draft has expired. Ask again to regenerate it.");
    }
    return new Response(new Uint8Array(draft.bytes), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${draft.fileName.replace(/"/g, "")}"`,
      },
    });
  } catch (err) {
    return jsonError(err, request);
  }
}
