import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { serializeIntake } from "@/lib/intake/serialize";
import { parseIntakeInput } from "@/lib/intake/validation";
import { createIntake, listIntakes } from "@/lib/repos/intake";
import { listFirmLawyers } from "@/lib/repos/matters";
import { assertCanUse } from "@/lib/licensing/policy";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

export async function GET(request: Request) {
  try {
    const session = await requirePermission("intake.view");
    const firmId = tenantFirmId(session);
    await assertCanUse(firmId, "intake");
    const url = new URL(request.url);
    const status = url.searchParams.get("status")?.trim() || undefined;
    const includeArchived = url.searchParams.get("archived") === "1";
    const includeAssignees = url.searchParams.get("includeAssignees") === "1";

    const rows = await listIntakes(firmId, { status, includeArchived });
    const payload: Record<string, unknown> = {
      items: rows.map((r) =>
        serializeIntake(r.intake, { assigneeName: r.assigneeName }),
      ),
    };
    if (includeAssignees) {
      payload.assignees = await listFirmLawyers(firmId);
    }
    return jsonOk(payload);
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("intake.manage");
    const firmId = tenantFirmId(session);
    await assertCanUse(firmId, "intake");
    const body = await request.json();
    const input = parseIntakeInput(body);

    const row = await createIntake(firmId, session.id, {
      ...input,
      status: input.status ?? "open",
    });

    await writeAuditLog({
      action: "intakes.create",
      firmId,
      userId: session.id,
      entityType: "intake",
      entityId: row.id,
      metadata: {
        prospectName: row.prospectName,
        status: row.status,
        note: "Prospect only. No client auto-created.",
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ intake: serializeIntake(row) }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
