import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { deleteFirmHoliday } from "@/lib/repos/crm";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

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
