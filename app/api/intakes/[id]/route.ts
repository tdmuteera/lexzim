import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import {
  conflictCheckAllowsConversion,
  parseConflictNotes,
} from "@/lib/conflicts/search";
import { serializeIntake } from "@/lib/intake/serialize";
import { isIntakeStatus, parseIntakeInput } from "@/lib/intake/validation";
import {
  getIntake,
  listConflictChecks,
  setIntakeStatus,
  updateIntake,
} from "@/lib/repos/intake";
import { listFirmLawyers } from "@/lib/repos/matters";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("intake.view");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const full = await getIntake(firmId, id);
    if (!full) {
      throw new AuthError("not_found", "Intake not found.");
    }

    const checks = await listConflictChecks(firmId, id);
    const latest = checks[0] ?? null;
    const assignees = await listFirmLawyers(firmId);
    const latestNotes = latest ? parseConflictNotes(latest.notes) : null;

    return jsonOk({
      intake: serializeIntake(full.intake, { assigneeName: full.assigneeName }),
      conflictChecks: checks.map((c) => {
        const parsed = parseConflictNotes(c.notes);
        return {
          id: c.id,
          query: c.query,
          result: c.result,
          notes: c.notes,
          checkedAt: c.checkedAt ? c.checkedAt.toISOString() : null,
          createdAt: c.createdAt.toISOString(),
          hitCount: parsed?.hitCount ?? null,
          hasPartnerOverride: Boolean(parsed?.partnerOverride),
        };
      }),
      latestHits: latestNotes?.hits ?? [],
      disclaimer:
        latestNotes?.disclaimer ??
        "Conflict search is an operational helper within this firm only. It is not legal advice and does not replace counsel judgment or a full conflicts review.",
      conversion: conflictCheckAllowsConversion(latest),
      canPartnerOverride: session.role.code === "managing_partner",
      assignees,
      conflictPanelNote:
        "Search clients, related parties, matters, and other intakes in this firm. Exact name matches flag conflict; partial matches flag possible.",
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("intake.manage");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;

    // Status-only shortcut: { status: "declined" | "archived" | "open" }
    if (
      body.status &&
      Object.keys(body).length === 1 &&
      (body.status === "open" ||
        body.status === "declined" ||
        body.status === "archived")
    ) {
      const row = await setIntakeStatus(firmId, id, body.status);
      if (!row) throw new AuthError("not_found", "Intake not found.");

      await writeAuditLog({
        action: "intakes.status",
        firmId,
        userId: session.id,
        entityType: "intake",
        entityId: id,
        metadata: { status: row.status },
        ipOrUserAgent: clientInfo(request),
      });

      return jsonOk({ intake: serializeIntake(row) });
    }

    const existing = await getIntake(firmId, id);
    if (!existing) throw new AuthError("not_found", "Intake not found.");

    const input = parseIntakeInput(body);
    if (input.status && !isIntakeStatus(input.status)) {
      throw new AuthError("validation", "Invalid status.");
    }

    const row = await updateIntake(firmId, id, input);
    if (!row) throw new AuthError("not_found", "Intake not found.");

    await writeAuditLog({
      action: "intakes.update",
      firmId,
      userId: session.id,
      entityType: "intake",
      entityId: row.id,
      metadata: {
        prospectName: row.prospectName,
        status: row.status,
        note: "No client auto-created on save.",
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ intake: serializeIntake(row) });
  } catch (err) {
    return jsonError(err);
  }
}
