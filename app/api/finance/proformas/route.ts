import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { isProformaKind, isProformaStatus } from "@/lib/proforma/types";
import { serializeProformaListItem } from "@/lib/proforma/serialize";
import { parseCreateProformaInput } from "@/lib/proforma/validation";
import { createProforma, listProformas } from "@/lib/repos/proformas";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

export async function GET(request: Request) {
  try {
    const session = await requirePermission("billing.view");
    const firmId = tenantFirmId(session);
    const url = new URL(request.url);
    const statusRaw = url.searchParams.get("status");
    const status = statusRaw && isProformaStatus(statusRaw) ? statusRaw : undefined;
    const kindRaw = url.searchParams.get("kind");
    const kind = kindRaw && isProformaKind(kindRaw) ? kindRaw : undefined;
    const clientId = url.searchParams.get("clientId")?.trim() || undefined;

    const rows = await listProformas(firmId, { status, kind, clientId });
    return jsonOk({ items: rows.map(serializeProformaListItem) });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("finance.quote.manage");
    const firmId = tenantFirmId(session);
    const body = await request.json();
    const input = parseCreateProformaInput(body);
    const created = await createProforma(
      firmId,
      session.id,
      input,
      session.firm.defaultCurrency || "USD",
    );

    await writeAuditLog({
      action: "proformas.create",
      firmId,
      userId: session.id,
      entityType: "pro_forma",
      entityId: created.id,
      metadata: {
        proformaNumber: created.proformaNumber,
        kind: created.kind,
        conveyancingCategory: created.conveyancingCategory,
        clientId: created.clientId,
      },
      ipOrUserAgent: clientInfo(request),
    });

    const detail = await listProformas(firmId);
    const row = detail.find((r) => r.proforma.id === created.id);
    if (!row) throw new AuthError("server", "Pro forma created but could not reload.");
    return jsonOk({ proforma: serializeProformaListItem(row) }, { status: 201 });
  } catch (err) {
    return jsonError(err, request);
  }
}
