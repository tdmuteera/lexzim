import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { requirePortalSession } from "@/lib/portal/auth";
import { isPortalEnabled } from "@/lib/portal/config";
import { buildPortalUserArchive } from "@/lib/export/build-portal-user-archive";

/**
 * Portal: download JSON of this user's portal-held data.
 */
export async function POST(request: Request) {
  try {
    if (!isPortalEnabled()) {
      throw new AuthError("portal_disabled", "Client portal is disabled.");
    }
    const session = await requirePortalSession();
    const archive = await buildPortalUserArchive(session);

    await writeAuditLog({
      action: "portal.data_exported",
      firmId: session.firmId,
      userId: null,
      entityType: "portal_user",
      entityId: session.id,
      metadata: { clientId: session.clientId },
      ipOrUserAgent: clientInfo(request),
    });

    const stamp = archive.exportedAt.replace(/[:.]/g, "-").slice(0, 19);
    const fileName = `lexzim-portal-export-${stamp}.json`;
    const body = `${JSON.stringify(archive, null, 2)}\n`;

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function GET(request: Request) {
  return POST(request);
}
