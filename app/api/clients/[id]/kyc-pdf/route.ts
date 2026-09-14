import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { serializeClient } from "@/lib/clients/serialize";
import { getFirmExportBranding } from "@/lib/export/branding";
import { exportKycPdf } from "@/lib/export/to-kyc-pdf";
import { getClientById, userCanAccessClient } from "@/lib/repos/clients";
import { canViewAllClients, requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

/** Download KYC intake PDF for a client. */
export async function GET(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("clients.view");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;

    const row = await getClientById(firmId, id);
    if (!row) {
      throw new AuthError("not_found", "Client not found.");
    }

    const allowed = await userCanAccessClient(
      firmId,
      id,
      session.id,
      canViewAllClients(session),
    );
    if (!allowed) {
      throw new AuthError("forbidden", "You do not have access to this client.");
    }

    const client = serializeClient(row);
    const branding = await getFirmExportBranding(firmId);
    const bytes = await exportKycPdf(branding, client);

    await writeAuditLog({
      action: "clients.kyc_pdf.download",
      firmId,
      userId: session.id,
      entityType: "client",
      entityId: id,
      metadata: { clientNumber: client.clientNumber },
      ipOrUserAgent: clientInfo(request),
    });

    const safeNumber = client.clientNumber.replace(/[^\w.-]+/g, "_");
    const fileName = `KYC-${safeNumber}.pdf`;

    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return jsonError(err, request);
  }
}
