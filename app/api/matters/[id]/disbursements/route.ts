import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { serializeDisbursement } from "@/lib/billing/serialize";
import { parseDisbursementInput } from "@/lib/billing/validation";
import {
  createDisbursement,
  getMatterDisbursementTotals,
  listDisbursements,
} from "@/lib/repos/billing";
import { getMatterById, userCanAccessMatter } from "@/lib/repos/matters";
import { canViewAllMatters, requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

async function assertMatterAccess(
  firmId: string,
  matterId: string,
  session: { id: string },
  viewAll: boolean,
) {
  const allowed = await userCanAccessMatter(firmId, matterId, session.id, viewAll);
  if (!allowed) {
    throw new AuthError("forbidden", "You do not have access to this matter.");
  }
  const matter = await getMatterById(firmId, matterId);
  if (!matter) {
    throw new AuthError("not_found", "Matter not found.");
  }
  return matter;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("billing.view");
    const firmId = tenantFirmId(session);
    const { id: matterId } = await context.params;
    const viewAll = canViewAllMatters(session);
    await assertMatterAccess(firmId, matterId, session, viewAll);

    const [rows, totals] = await Promise.all([
      listDisbursements(firmId, matterId),
      getMatterDisbursementTotals(firmId, matterId),
    ]);

    return jsonOk({
      items: rows.map(serializeDisbursement),
      totals,
      defaultCurrency: session.firm.defaultCurrency || "USD",
    });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("billing.manage");
    const firmId = tenantFirmId(session);
    const { id: matterId } = await context.params;
    const viewAll = canViewAllMatters(session);
    await assertMatterAccess(firmId, matterId, session, viewAll);

    const body = await request.json();
    const input = parseDisbursementInput(body, {
      currency: session.firm.defaultCurrency || "USD",
    });

    const row = await createDisbursement(firmId, matterId, session.id, input);

    await writeAuditLog({
      action: "disbursements.create",
      firmId,
      userId: session.id,
      entityType: "disbursement",
      entityId: row.id,
      metadata: {
        matterId,
        amountCents: row.amountCents,
        currency: row.currency,
        billableToClient: row.billable,
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ disbursement: serializeDisbursement(row) }, { status: 201 });
  } catch (err) {
    return jsonError(err, request);
  }
}
