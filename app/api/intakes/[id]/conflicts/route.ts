import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import {
  buildIntakeConflictQuery,
  conflictCheckAllowsConversion,
  encodeConflictNotes,
  runConflictSearch,
} from "@/lib/conflicts/search";
import { createConflictCheck, getIntake } from "@/lib/repos/intake";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/intakes/[id]/conflicts
 * Body optional: { query?: string } — defaults to prospect + opposing party.
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("intake.manage");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;

    const full = await getIntake(firmId, id);
    if (!full) throw new AuthError("not_found", "Intake not found.");

    let query = buildIntakeConflictQuery(full.intake);
    try {
      const body = (await request.json()) as { query?: unknown };
      if (typeof body.query === "string" && body.query.trim()) {
        query = body.query.trim();
      }
    } catch {
      /* empty body ok */
    }

    const search = await runConflictSearch(firmId, query, {
      excludeIntakeId: id,
    });

    const notes = encodeConflictNotes({
      v: 1,
      hitCount: search.hits.length,
      hits: search.hits.slice(0, 50),
      disclaimer: search.disclaimer,
    });

    const check = await createConflictCheck({
      firmId,
      intakeId: id,
      userId: session.id,
      query: search.query || query,
      result: search.result,
      notes,
    });

    await writeAuditLog({
      action: "conflicts.run",
      firmId,
      userId: session.id,
      entityType: "conflict_check",
      entityId: check.id,
      metadata: {
        intakeId: id,
        result: check.result,
        hitCount: search.hits.length,
        terms: search.terms,
      },
      ipOrUserAgent: clientInfo(request),
    });

    const gate = conflictCheckAllowsConversion(check);

    return jsonOk({
      check: {
        id: check.id,
        query: check.query,
        result: check.result,
        notes: check.notes,
        checkedAt: check.checkedAt?.toISOString() ?? null,
        createdAt: check.createdAt.toISOString(),
      },
      search: {
        terms: search.terms,
        result: search.result,
        hits: search.hits,
        disclaimer: search.disclaimer,
      },
      conversion: gate,
    });
  } catch (err) {
    return jsonError(err);
  }
}
