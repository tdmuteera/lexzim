import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { serializeProcedure } from "@/lib/procedures/serialize";
import { parseProcedureInput } from "@/lib/procedures/validation";
import { createMatterEvent } from "@/lib/repos/matter-workflow";
import { getMatterById, listFirmLawyers, userCanAccessMatter } from "@/lib/repos/matters";
import {
  createProcedure,
  listProceduresForMatter,
} from "@/lib/repos/procedures";
import { canViewAllMatters, requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

async function assertMatterAccess(firmId: string, matterId: string, session: {
  id: string;
}, viewAll: boolean) {
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
    const session = await requirePermission("matters.view");
    const firmId = tenantFirmId(session);
    const { id: matterId } = await context.params;
    const viewAll = canViewAllMatters(session);
    await assertMatterAccess(firmId, matterId, session, viewAll);

    const url = new URL(request.url);
    const includeAssignees = url.searchParams.get("includeAssignees") === "1";

    const rows = await listProceduresForMatter(firmId, matterId);
    const payload: Record<string, unknown> = {
      items: rows.map((row) =>
        serializeProcedure(row, {
          assigneeName: row.assigneeName,
          matterTitle: row.matterTitle,
        }),
      ),
    };
    if (includeAssignees) {
      payload.assignees = await listFirmLawyers(firmId);
    }
    return jsonOk(payload);
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("matters.edit");
    const firmId = tenantFirmId(session);
    const { id: matterId } = await context.params;
    const viewAll = canViewAllMatters(session);
    await assertMatterAccess(firmId, matterId, session, viewAll);

    const body = await request.json();
    const input = parseProcedureInput(body);
    const row = await createProcedure(firmId, matterId, session.id, input);

    await createMatterEvent({
      firmId,
      matterId,
      eventType: "procedure",
      title: `Procedure added: ${row.title}`,
      body: row.dueAt ? `Due ${row.dueAt.toISOString()}` : null,
      createdBy: session.id,
    });

    await writeAuditLog({
      action: "procedures.create",
      firmId,
      userId: session.id,
      entityType: "pending_procedure",
      entityId: row.id,
      metadata: { matterId, title: row.title, status: row.status },
      ipOrUserAgent: clientInfo(request),
    });

    const full = await listProceduresForMatter(firmId, matterId).then((items) =>
      items.find((p) => p.id === row.id),
    );

    return jsonOk(
      {
        procedure: serializeProcedure(full ?? row, {
          assigneeName: full?.assigneeName,
          matterTitle: full?.matterTitle,
        }),
      },
      { status: 201 },
    );
  } catch (err) {
    return jsonError(err, request);
  }
}
