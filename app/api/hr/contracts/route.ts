import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { HR_CONTRACT_STATUSES } from "@/lib/hr/validation";
import { parseHrContractInput } from "@/lib/hr/validation";
import {
  createHrContract,
  getHrContract,
  listHrContracts,
} from "@/lib/repos/hr";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

function serializeContract(row: Awaited<ReturnType<typeof listHrContracts>>[number]) {
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

/**
 * GET /api/hr/contracts?staffProfileId=&status=
 * POST /api/hr/contracts
 */
export async function GET(request: Request) {
  try {
    const session = await requirePermission("hr.view");
    const firmId = tenantFirmId(session);
    const url = new URL(request.url);
    const staffProfileId = url.searchParams.get("staffProfileId")?.trim() || undefined;
    const status = url.searchParams.get("status")?.trim() || undefined;

    if (status && !HR_CONTRACT_STATUSES.includes(status as typeof HR_CONTRACT_STATUSES[number])) {
      throw new AuthError("validation", `Invalid status. Use: ${HR_CONTRACT_STATUSES.join(", ")}`);
    }

    const rows = await listHrContracts(firmId, { staffProfileId, status });
    return jsonOk({ items: rows.map(serializeContract) });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("hr.manage");
    const firmId = tenantFirmId(session);
    const body = await request.json();
    const input = parseHrContractInput(body);
    const contract = await createHrContract(firmId, input);

    await writeAuditLog({
      action: "hr_contract.create",
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
    return jsonOk(
      { contract: full ? serializeContract(full) : null },
      { status: 201 },
    );
  } catch (err) {
    return jsonError(err, request);
  }
}
