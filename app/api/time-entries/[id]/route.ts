import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { serializeTimeEntry } from "@/lib/billing/serialize";
import { parseTimeEntryInput } from "@/lib/billing/validation";
import {
  deleteTimeEntry,
  getTimeEntry,
  updateTimeEntry,
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
    const full = await getTimeEntry(firmId, id);
    if (!full) {
      throw new AuthError("not_found", "Time entry not found.");
    }

    const viewAll = canViewAllMatters(session);
    const allowed = await userCanAccessMatter(
      firmId,
      full.entry.matterId,
      session.id,
      viewAll,
    );
    if (!allowed) {
      throw new AuthError("forbidden", "You do not have access to this matter.");
    }

    return jsonOk({
      entry: serializeTimeEntry(full.entry, { userName: full.userName }),
    });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("billing.manage");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const existing = await getTimeEntry(firmId, id);
    if (!existing) {
      throw new AuthError("not_found", "Time entry not found.");
    }

    const viewAll = canViewAllMatters(session);
    const allowed = await userCanAccessMatter(
      firmId,
      existing.entry.matterId,
      session.id,
      viewAll,
    );
    if (!allowed) {
      throw new AuthError("forbidden", "You do not have access to this matter.");
    }

    const body = await request.json();
    const input = parseTimeEntryInput(body, {
      currency: existing.entry.currency || session.firm.defaultCurrency || "USD",
    });

    const row = await updateTimeEntry(firmId, id, input);
    if (!row) {
      throw new AuthError("not_found", "Time entry not found.");
    }

    const full = await getTimeEntry(firmId, id);

    await writeAuditLog({
      action: "time_entries.update",
      firmId,
      userId: session.id,
      entityType: "time_entry",
      entityId: row.id,
      metadata: {
        matterId: row.matterId,
        minutes: row.minutes,
        billable: row.billable,
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({
      entry: serializeTimeEntry(row, { userName: full?.userName ?? null }),
    });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("billing.manage");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const existing = await getTimeEntry(firmId, id);
    if (!existing) {
      throw new AuthError("not_found", "Time entry not found.");
    }

    const viewAll = canViewAllMatters(session);
    const allowed = await userCanAccessMatter(
      firmId,
      existing.entry.matterId,
      session.id,
      viewAll,
    );
    if (!allowed) {
      throw new AuthError("forbidden", "You do not have access to this matter.");
    }

    const deleted = await deleteTimeEntry(firmId, id);
    if (!deleted) {
      throw new AuthError("not_found", "Time entry not found.");
    }

    await writeAuditLog({
      action: "time_entries.delete",
      firmId,
      userId: session.id,
      entityType: "time_entry",
      entityId: id,
      metadata: {
        matterId: existing.entry.matterId,
        minutes: existing.entry.minutes,
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ deleted: true });
  } catch (err) {
    return jsonError(err, request);
  }
}
