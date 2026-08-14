import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { invoiceDetailPath } from "@/lib/billing/paths";
import { convertQuotationToInvoice } from "@/lib/repos/quotations";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await requirePermission("finance.quote.manage");
    const firmId = tenantFirmId(session);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const matterId =
      body && typeof body === "object" && typeof (body as Record<string, unknown>).matterId === "string"
        ? (body as Record<string, string>).matterId
        : undefined;

    const result = await convertQuotationToInvoice(firmId, session.id, id, { matterId });

    await writeAuditLog({
      action: "quotations.convert_invoice",
      firmId,
      userId: session.id,
      entityType: "quotation",
      entityId: id,
      metadata: {
        invoiceId: result.invoice.id,
        invoiceNumber: result.invoice.invoiceNumber,
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({
      invoice: {
        id: result.invoice.id,
        invoiceNumber: result.invoice.invoiceNumber,
        href: invoiceDetailPath(result.invoice.id),
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
