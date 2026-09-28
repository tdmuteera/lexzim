import { jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { isMissingRelationError } from "@/lib/db/missing-relation";
import { parseItemInput, parseRecurrence, parseToday } from "@/lib/my-day/validation";
import { createMyDayItem, getMyDayPayload } from "@/lib/repos/my-day";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

const MIGRATION_HINT =
  "My Day tables are missing on this database. Run npm run db:migrate (migration 0053_my_day), then refresh.";

/** GET /api/my-day?today=YYYY-MM-DD — owner's own list only. */
export async function GET(request: Request) {
  try {
    const session = await requirePermission("dashboard.view");
    const firmId = tenantFirmId(session);
    const today = parseToday(new URL(request.url).searchParams.get("today"));
    try {
      return jsonOk(await getMyDayPayload(firmId, session.id, today));
    } catch (err) {
      if (isMissingRelationError(err)) throw new AuthError("validation", MIGRATION_HINT);
      throw err;
    }
  } catch (err) {
    return jsonError(err, request);
  }
}

/** POST /api/my-day — add an item (optionally repeating). */
export async function POST(request: Request) {
  try {
    const session = await requirePermission("dashboard.view");
    const firmId = tenantFirmId(session);
    const body = (await request.json()) as Record<string, unknown>;
    const today = parseToday(body.today);
    const input = parseItemInput(body, today);
    const recurrence = parseRecurrence(body.recurrence, input.dueDate ?? today);
    try {
      const created = await createMyDayItem(firmId, session.id, input, recurrence, today);
      return jsonOk({ created, ...(await getMyDayPayload(firmId, session.id, today)) }, { status: 201 });
    } catch (err) {
      if (isMissingRelationError(err)) throw new AuthError("validation", MIGRATION_HINT);
      throw err;
    }
  } catch (err) {
    return jsonError(err, request);
  }
}
