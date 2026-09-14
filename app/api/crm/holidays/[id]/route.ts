import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { deleteFirmHoliday, updateFirmHoliday } from "@/lib/repos/crm";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requirePermission("crm.manage");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const body = (await request.json()) as {
      holidayDate?: string;
      name?: string;
      country?: string;
    };

    let holidayDate: Date | undefined;
    if (typeof body.holidayDate === "string" && body.holidayDate.trim()) {
      holidayDate = new Date(body.holidayDate);
      if (Number.isNaN(holidayDate.getTime())) {
        throw new AuthError("validation", "holidayDate is invalid.");
      }
    }

    const updated = await updateFirmHoliday(firmId, id, {
      holidayDate,
      name: typeof body.name === "string" ? body.name : undefined,
      country: typeof body.country === "string" ? body.country : undefined,
    });
    if (!updated) {
      throw new AuthError("not_found", "Holiday not found.");
    }

    await writeAuditLog({
      action: "crm.holidays.update",
      firmId,
      userId: session.id,
      entityType: "firm_holiday",
      entityId: id,
      metadata: {
        name: updated.name,
        holidayDate: updated.holidayDate.toISOString(),
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({
      holiday: {
        id: updated.id,
        holidayDate: updated.holidayDate.toISOString(),
        name: updated.name,
        country: updated.country,
      },
    });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requirePermission("crm.manage");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;

    const deleted = await deleteFirmHoliday(firmId, id);
    if (!deleted) {
      throw new AuthError("not_found", "Holiday not found.");
    }

    await writeAuditLog({
      action: "crm.holidays.delete",
      firmId,
      userId: session.id,
      entityType: "firm_holiday",
      entityId: id,
      metadata: { name: deleted.name },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ deleted: true });
  } catch (err) {
    return jsonError(err, request);
  }
}
