import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { getClientById } from "@/lib/repos/clients";
import { assertClearConflictForOpenMatter } from "@/lib/repos/conflict-checks";
import { serializeMatter } from "@/lib/matters/serialize";
import { MATTER_STATUSES, parseMatterInput } from "@/lib/matters/validation";
import { createMatterEvent } from "@/lib/repos/matter-workflow";
import { createMatter, listFirmLawyers, listMatters } from "@/lib/repos/matters";
import { assertCanCreateMatter } from "@/lib/licensing/policy";
import { canViewAllMatters, requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";
import type { MatterStatus } from "@/lib/db/mvp-types";

export async function GET(request: Request) {
  try {
    const session = await requirePermission("matters.view");
    const firmId = tenantFirmId(session);
    const url = new URL(request.url);
    const q = url.searchParams.get("q") ?? undefined;
    const status = url.searchParams.get("status");
    const bucket = url.searchParams.get("bucket");
    const areaOfLaw = url.searchParams.get("areaOfLaw") ?? undefined;
    const clientId = url.searchParams.get("clientId") ?? undefined;
    const responsibleLawyerId = url.searchParams.get("responsibleLawyerId") ?? undefined;
    const sort = url.searchParams.get("sort");
    const sortDir = url.searchParams.get("sortDir");
    const includeLawyers = url.searchParams.get("includeLawyers") === "1";

    const viewAll = canViewAllMatters(session);
    const rows = await listMatters(firmId, {
      q,
      status:
        status && MATTER_STATUSES.includes(status as MatterStatus)
          ? (status as MatterStatus)
          : undefined,
      bucket:
        bucket === "open" || bucket === "closed" || bucket === "all" ? bucket : "open",
      areaOfLaw,
      clientId,
      responsibleLawyerId,
      viewAll,
      userId: session.id,
      sort:
        sort === "title" || sort === "nextHearing" || sort === "created" || sort === "updated"
          ? sort
          : "updated",
      sortDir: sortDir === "asc" ? "asc" : "desc",
    });

    const payload: Record<string, unknown> = {
      items: rows.map((row) =>
        serializeMatter(row, {
          clientDisplayName: row.clientDisplayName,
          responsibleLawyerName: row.responsibleLawyerName,
          trackingSummary: row.trackingSummary,
          trackingOn: row.trackingOn,
        }),
      ),
      viewAll,
    };

    if (includeLawyers) {
      payload.lawyers = await listFirmLawyers(firmId);
    }

    return jsonOk(payload, { request });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("matters.create");
    const firmId = tenantFirmId(session);
    await assertCanCreateMatter(firmId);
    const body = await request.json();
    const input = parseMatterInput(body);

    const client = await getClientById(firmId, input.clientId);
    if (!client) {
      throw new AuthError("validation", "Client not found in this firm.");
    }
    if (client.archivedAt) {
      throw new AuthError("validation", "Cannot open a matter for an archived client.");
    }

    const status = input.status ?? "prospective";
    await assertClearConflictForOpenMatter(firmId, input.clientId, status);

    const row = await createMatter(firmId, session.id, input);

    await createMatterEvent({
      firmId,
      matterId: row.id,
      eventType: "system",
      title: "Matter created",
      body: `Status: ${row.status}.`,
      createdBy: session.id,
    });

    await writeAuditLog({
      action: "matters.create",
      firmId,
      userId: session.id,
      entityType: "matter",
      entityId: row.id,
      metadata: {
        title: row.title,
        clientId: row.clientId,
        status: row.status,
        areaOfLaw: row.areaOfLaw,
      },
      ipOrUserAgent: clientInfo(request),
    });

    const full = await listMatters(firmId, {
      clientId: row.clientId,
      bucket: "all",
      viewAll: true,
    }).then((items) => items.find((m) => m.id === row.id));

    return jsonOk(
      {
        matter: serializeMatter(full ?? row, {
          clientDisplayName: full?.clientDisplayName,
          responsibleLawyerName: full?.responsibleLawyerName,
        }),
      },
      { status: 201, request },
    );
  } catch (err) {
    return jsonError(err, request);
  }
}
