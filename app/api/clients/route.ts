import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { serializeClient } from "@/lib/clients/serialize";
import { parseClientInput } from "@/lib/clients/validation";
import { createClient, listClients } from "@/lib/repos/clients";
import { listFirmLawyers } from "@/lib/repos/matters";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

export async function GET(request: Request) {
  try {
    const session = await requirePermission("clients.view");
    const firmId = tenantFirmId(session);
    const url = new URL(request.url);
    const q = url.searchParams.get("q") ?? undefined;
    const clientType = url.searchParams.get("clientType");
    const archived = url.searchParams.get("archived");
    const includeLawyers = url.searchParams.get("includeLawyers") === "1";
    const sort = url.searchParams.get("sort");
    const sortDir = url.searchParams.get("sortDir");

    const rows = await listClients(firmId, {
      q,
      clientType:
        clientType === "individual" ||
        clientType === "corporate" ||
        clientType === "partnership" ||
        clientType === "trust" ||
        clientType === "company"
          ? clientType
          : undefined,
      archived:
        archived === "active" || archived === "archived" || archived === "all"
          ? archived
          : "active",
      sort: sort === "created" || sort === "updated" || sort === "name" || sort === "number" ? sort : "name",
      sortDir: sortDir === "desc" ? "desc" : "asc",
    });

    const payload: Record<string, unknown> = {
      items: rows.map(serializeClient),
    };
    if (includeLawyers) {
      payload.lawyers = await listFirmLawyers(firmId);
    }

    return jsonOk(payload);
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("clients.create");
    const firmId = tenantFirmId(session);
    const body = await request.json();
    const input = parseClientInput(body, { requireKycCore: true });

    const row = await createClient(firmId, session.id, input);

    await writeAuditLog({
      action: "clients.create",
      firmId,
      userId: session.id,
      entityType: "client",
      entityId: row.id,
      metadata: {
        clientType: row.clientType,
        clientNumber: row.clientNumber,
        displayName: serializeClient(row).displayName,
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ client: serializeClient(row) }, { status: 201 });
  } catch (err) {
    return jsonError(err, request);
  }
}
