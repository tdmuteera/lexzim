import { writeAuditLog } from "@/lib/auth/audit";
import { AuthError } from "@/lib/auth/types";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { parseHrContractInput } from "@/lib/hr/validation";
import { deleteHrContract, getHrContract, updateHrContract } from "@/lib/repos/hr";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

function serializeContract(row: NonNullable<Awaited<ReturnType<typeof getHrContract>>>) {
  return {
    id: row.contract.id,
    staffProfileId: row.contract.staffProfileId,
    staffName: row.staffName,
    staffIsActive: row.staffIsActive,
    title: row.contract.title,
    startDate: row.contract.startDate.toISOString(),
    endDate: row.contract.endDate?.toISOString() ?? null,
    status: row.contract.status,
    contractDocumentName: row.contract.contractDocumentName,
    hasDocument: Boolean(row.contract.contractDocumentPath),
    notes: row.contract.notes,
    createdAt: row.contract.createdAt.toISOString(),
    updatedAt: row.contract.updatedAt.toISOString(),
  };
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("hr.view");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const row = await getHrContract(firmId, id);
    if (!row) {
      throw new AuthError("not_found", "Contract not found.");
    }
    return jsonOk({ contract: serializeContract(row) });
  } catch (err) {
    return jsonError(err);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("hr.manage");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const body = await request.json();
    const input = parseHrContractInput(body);
    const contract = await updateHrContract(firmId, id, input);
    if (!contract) {
      throw new AuthError("not_found", "Contract not found.");
    }

    await writeAuditLog({
      action: "hr_contract.update",
      firmId,
      userId: session.id,
      entityType: "hr_contract",
      entityId: contract.id,
      metadata: {
        staffProfileId: contract.staffProfileId,
        title: contract.title,
        status: contract.status,
      },
      ipOrUserAgent: clientInfo(request),
    });

    const full = await getHrContract(firmId, contract.id);
    return jsonOk({ contract: full ? serializeContract(full) : null });
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("hr.manage");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const contract = await deleteHrContract(firmId, id);
    if (!contract) {
      throw new AuthError("not_found", "Contract not found.");
    }

    await writeAuditLog({
      action: "hr_contract.delete",
      firmId,
      userId: session.id,
      entityType: "hr_contract",
      entityId: contract.id,
      metadata: { title: contract.title, staffProfileId: contract.staffProfileId },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ deleted: true });
  } catch (err) {
    return jsonError(err);
  }
}
