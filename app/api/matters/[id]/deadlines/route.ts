import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { serializeMatterDeadline } from "@/lib/deadlines/serialize";
import { parseApplyDeadlineInput } from "@/lib/deadlines/validation";
import {
  applyDeadlineTemplate,
  listMatterDeadlines,
} from "@/lib/repos/calendar";
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

export async function GET(_request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("calendar.view");
    const firmId = tenantFirmId(session);
    const { id: matterId } = await context.params;
    const viewAll = canViewAllMatters(session);
    await assertMatterAccess(firmId, matterId, session, viewAll);

    const rows = await listMatterDeadlines(firmId, matterId);
    return jsonOk({ items: rows.map((r) => serializeMatterDeadline(r)) });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("calendar.manage");
    const firmId = tenantFirmId(session);
    const { id: matterId } = await context.params;
    const viewAll = canViewAllMatters(session);
    await assertMatterAccess(firmId, matterId, session, viewAll);

    const body = await request.json();
    const input = parseApplyDeadlineInput(body);
    const result = await applyDeadlineTemplate(firmId, matterId, session.id, input);

    if (result.error === "template_not_found") {
      throw new AuthError("validation", "Active deadline template not found.");
    }

    await writeAuditLog({
      action: "matter_deadlines.apply",
      firmId,
      userId: session.id,
      entityType: "matter_deadline",
      entityId: result.deadline.id,
      metadata: {
        matterId,
        templateId: input.templateId,
        dueAt: result.dueAt.toISOString(),
        calendarEventId: result.calendarEventId,
        title: result.deadline.title,
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk(
      { deadline: serializeMatterDeadline(result.deadline) },
      { status: 201 },
    );
  } catch (err) {
    return jsonError(err);
  }
}
