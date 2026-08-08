import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import {
  conflictStatusForMatter,
  parseConvertIntakeInput,
  resolveAreaOfLaw,
} from "@/lib/intake/convert";
import { serializeIntake } from "@/lib/intake/serialize";
import {
  convertIntake,
  getIntake,
  getLatestConflictCheck,
} from "@/lib/repos/intake";
import { assertCanCreateMatter } from "@/lib/licensing/policy";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/intakes/[id]/convert
 * Conflict gate enforced. Creates client + matter + optional opposing party.
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("intake.manage");
    const firmId = tenantFirmId(session);
    await assertCanCreateMatter(firmId);
    const { id } = await context.params;

    const full = await getIntake(firmId, id);
    if (!full) throw new AuthError("not_found", "Intake not found.");

    const latestCheck = await getLatestConflictCheck(firmId, id);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    // Prefill defaults from intake when wizard sends partial body
    const defaults = {
      clientType: body.clientType ?? "individual",
      fullName:
        body.fullName ??
        (body.clientType === "company" ? null : full.intake.prospectName),
      legalName:
        body.legalName ??
        (body.clientType === "company" ? full.intake.prospectName : null),
      title:
        body.title ??
        full.intake.matterSummary ??
        `Matter: ${full.intake.prospectName}`,
      areaOfLaw:
        body.areaOfLaw ??
        resolveAreaOfLaw(full.intake.areaOfLaw, "Civil") ??
        "Civil",
      matterStatus: body.matterStatus ?? "open",
      matterDescription: body.matterDescription ?? full.intake.matterSummary,
      opposingPartyName: body.opposingPartyName ?? full.intake.opposingParty,
      responsibleLawyerId: body.responsibleLawyerId ?? full.intake.assignedTo,
      conflictCheckStatus:
        body.conflictCheckStatus ??
        conflictStatusForMatter(latestCheck?.result ?? "not_done"),
    };

    const input = parseConvertIntakeInput(defaults);
    const result = await convertIntake(
      firmId,
      session.id,
      id,
      input,
      latestCheck,
    );
    if (!result) throw new AuthError("not_found", "Intake not found.");

    await writeAuditLog({
      action: "intakes.convert",
      firmId,
      userId: session.id,
      entityType: "intake",
      entityId: id,
      metadata: {
        clientId: result.client.id,
        matterId: result.matter.id,
        opposingPartyId: result.opposingPartyId,
        conflictResult: latestCheck?.result ?? null,
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({
      intake: serializeIntake(result.intake),
      clientId: result.client.id,
      matterId: result.matter.id,
      opposingPartyId: result.opposingPartyId,
      redirectTo: `/matters/${result.matter.id}`,
    });
  } catch (err) {
    return jsonError(err);
  }
}
