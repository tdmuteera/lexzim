import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import {
  conflictCheckAllowsConversion,
  encodeConflictNotes,
  parseConflictNotes,
} from "@/lib/conflicts/search";
import {
  getConflictCheck,
  getIntake,
  updateConflictCheckNotes,
} from "@/lib/repos/intake";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/intakes/[id]/conflicts/override
 * Managing Partner only. Body: { checkId: string, reason: string }
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("intake.manage");
    const firmId = tenantFirmId(session);
    const { id: intakeId } = await context.params;

    if (session.role.code !== "managing_partner") {
      throw new AuthError(
        "forbidden",
        "Only the Managing Partner can override a conflict warning.",
      );
    }

    const full = await getIntake(firmId, intakeId);
    if (!full) throw new AuthError("not_found", "Intake not found.");

    const body = (await request.json()) as {
      checkId?: unknown;
      reason?: unknown;
    };
    const checkId = typeof body.checkId === "string" ? body.checkId : "";
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!checkId) throw new AuthError("validation", "checkId is required.");
    if (reason.length < 8) {
      throw new AuthError(
        "validation",
        "Override reason must be at least 8 characters.",
      );
    }

    const check = await getConflictCheck(firmId, checkId);
    if (!check || check.intakeId !== intakeId) {
      throw new AuthError("not_found", "Conflict check not found for this intake.");
    }
    if (check.result !== "conflict" && check.result !== "possible") {
      throw new AuthError(
        "validation",
        "Override applies only when result is conflict or possible.",
      );
    }

    const existing = parseConflictNotes(check.notes);
    const nextNotes = encodeConflictNotes({
      v: 1,
      hitCount: existing?.hitCount ?? 0,
      hits: existing?.hits ?? [],
      disclaimer:
        existing?.disclaimer ??
        "Conflict search is an operational helper within this firm only.",
      partnerOverride: {
        reason,
        byUserId: session.id,
        byEmail: session.email,
        at: new Date().toISOString(),
      },
    });

    const updated = await updateConflictCheckNotes(firmId, checkId, nextNotes);
    if (!updated) throw new AuthError("not_found", "Conflict check not found.");

    await writeAuditLog({
      action: "conflicts.partner_override",
      firmId,
      userId: session.id,
      entityType: "conflict_check",
      entityId: checkId,
      metadata: {
        intakeId,
        result: check.result,
        reason,
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({
      check: {
        id: updated.id,
        query: updated.query,
        result: updated.result,
        notes: updated.notes,
        checkedAt: updated.checkedAt?.toISOString() ?? null,
        createdAt: updated.createdAt.toISOString(),
      },
      conversion: conflictCheckAllowsConversion(updated),
    });
  } catch (err) {
    return jsonError(err);
  }
}
