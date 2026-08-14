import { jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { listFirmServices, updateFirmService } from "@/lib/repos/firm-services";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

export async function GET() {
  try {
    const session = await requirePermission("billing.view");
    const firmId = tenantFirmId(session);
    const currency = session.firm.defaultCurrency || "USD";
    const rows = await listFirmServices(firmId, { activeOnly: false });
    return jsonOk({
      items: rows.map(({ service, glCode, glName }) => ({
        id: service.id,
        code: service.code,
        name: service.name,
        description: service.description,
        defaultPriceCents: service.defaultPriceCents,
        currency: service.currency || currency,
        revenueGlAccountId: service.revenueGlAccountId,
        revenueGlCode: glCode,
        revenueGlName: glName,
        isActive: service.isActive,
        sortOrder: service.sortOrder,
      })),
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requirePermission("finance.quote.manage");
    const firmId = tenantFirmId(session);
    const body = await request.json();
    if (!body || typeof body !== "object") throw new AuthError("validation", "Invalid payload");
    const raw = body as Record<string, unknown>;
    const id = typeof raw.id === "string" ? raw.id : "";
    if (!id) throw new AuthError("validation", "Service id is required");

    const service = await updateFirmService(firmId, id, {
      ...(typeof raw.name === "string" ? { name: raw.name } : {}),
      ...(raw.description !== undefined
        ? { description: typeof raw.description === "string" ? raw.description : null }
        : {}),
      ...(raw.defaultPriceCents !== undefined ? { defaultPriceCents: Number(raw.defaultPriceCents) } : {}),
      ...(typeof raw.isActive === "boolean" ? { isActive: raw.isActive } : {}),
    });

    return jsonOk({ service });
  } catch (err) {
    return jsonError(err);
  }
}
