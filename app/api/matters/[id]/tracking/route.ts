import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { formatTrackingDate, parseTrackingInput } from "@/lib/matters/tracking";
import { createMatterEvent } from "@/lib/repos/matter-workflow";
import { getMatterById, userCanAccessMatter } from "@/lib/repos/matters";
import { createTrackingEntry, listTrackingForMatter } from "@/lib/repos/matter-tracking";
import { canViewAllMatters, requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

function serializeEntry(row: {
  id: string;
  summary: string;
  happensOn: string;
  createdByName: string | null;
  createdAt: Date;
}) {
  return {
    id: row.id,
    summary: row.summary,
    happensOn: row.happensOn,
    happensOnLabel: formatTrackingDate(row.happensOn),
    createdByName: row.createdByName,
    createdAt: row.createdAt.toISOString(),
  };
}

async function assertMatterAccess(
  firmId: string,
  matterId: string,
  userId: string,
  viewAll: boolean,
) {
  const allowed = await userCanAccessMatter(firmId, matterId, userId, viewAll);
  if (!allowed) {
    throw new AuthError("forbidden", "You do not have access to this matter.");
  }
  const matter = await getMatterById(firmId, matterId);
  if (!matter) throw new AuthError("not_found", "Matter not found.");
  return matter;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("matters.view");
    const firmId = tenantFirmId(session);
    const { id: matterId } = await context.params;
    await assertMatterAccess(firmId, matterId, session.id, canViewAllMatters(session));
    const items = await listTrackingForMatter(firmId, matterId);
    return jsonOk({ items: items.map(serializeEntry) });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("matters.edit");
    const firmId = tenantFirmId(session);
    const { id: matterId } = await context.params;
    await assertMatterAccess(firmId, matterId, session.id, canViewAllMatters(session));

    const input = parseTrackingInput(await request.json());
    const row = await createTrackingEntry(firmId, matterId, session.id, input);
    const when = formatTrackingDate(input.happensOn);

    await createMatterEvent({
      firmId,
      matterId,
      eventType: "system",
      title: `Tracking updated: ${input.summary}`,
      body: when,
      createdBy: session.id,
    });

    await writeAuditLog({
      action: "matters.tracking_update",
      firmId,
      userId: session.id,
      entityType: "matter",
      entityId: matterId,
      metadata: { summary: input.summary, happensOn: input.happensOn },
      ipOrUserAgent: clientInfo(request),
    });

    const items = await listTrackingForMatter(firmId, matterId);
    const current = items.find((item) => item.id === row.id) ?? items[0];
    return jsonOk({ item: current ? serializeEntry(current) : null, items: items.map(serializeEntry) }, { status: 201 });
  } catch (err) {
    return jsonError(err, request);
  }
}
