import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { serializeDisbursement } from "@/lib/billing/serialize";
import { parseDisbursementInput } from "@/lib/billing/validation";
import {
  deleteDisbursement,
  getDisbursement,
  updateDisbursement,
} from "@/lib/repos/billing";
import { userCanAccessMatter } from "@/lib/repos/matters";
import { canViewAllMatters, requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("billing.view");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const row = await getDisbursement(firmId, id);
    if (!row) {
      throw new AuthError("not_found", "Disbursement not found.");
    }

    const viewAll = canViewAllMatters(session);
    const allowed = await userCanAccessMatter(
      firmId,
      row.matterId,
      session.id,
      viewAll,
    );
    if (!allowed) {
      throw new AuthError("forbidden", "You do not have access to this matter.");
    }

    return jsonOk({ disbursement: serializeDisbursement(row) });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("billing.manage");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const existing = await getDisbursement(firmId, id);
    if (!existing) {
      throw new AuthError("not_found", "Disbursement not found.");
    }

    const viewAll = canViewAllMatters(session);
    const allowed = await userCanAccessMatter(
      firmId,
      existing.matterId,
      session.id,
      viewAll,
    );
    if (!allowed) {
      throw new AuthError("forbidden", "You do not have access to this matter.");
    }

    const body = await request.json();
    const input = parseDisbursementInput(body, {
      currency: existing.currency || session.firm.defaultCurrency || "USD",
    });

    const row = await updateDisbursement(firmId, id, input, session.id);
    if (!row) {
      throw new AuthError("not_found", "Disbursement not found.");
    }

    await writeAuditLog({
      action: "disbursements.update",
      firmId,
      userId: session.id,
      entityType: "disbursement",
      entityId: row.id,
      metadata: {
        matterId: row.matterId,
        amountCents: row.amountCents,
        billableToClient: row.billable,
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ disbursement: serializeDisbursement(row) });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("billing.manage");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const existing = await getDisbursement(firmId, id);
    if (!existing) {
      throw new AuthError("not_found", "Disbursement not found.");
    }

    const viewAll = canViewAllMatters(session);
    const allowed = await userCanAccessMatter(
      firmId,
      existing.matterId,
      session.id,
      viewAll,
    );
    if (!allowed) {
      throw new AuthError("forbidden", "You do not have access to this matter.");
    }

    const deleted = await deleteDisbursement(firmId, id, session.id);
    if (!deleted) {
      throw new AuthError("not_found", "Disbursement not found.");
    }

    await writeAuditLog({
      action: "disbursements.delete",
      firmId,
      userId: session.id,
      entityType: "disbursement",
      entityId: id,
      metadata: {
        matterId: existing.matterId,
        amountCents: existing.amountCents,
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ deleted: true });
  } catch (err) {
    return jsonError(err, request);
  }
}
