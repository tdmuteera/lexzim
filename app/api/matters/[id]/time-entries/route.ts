import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { serializeTimeEntry } from "@/lib/billing/serialize";
import { parseTimeEntryInput } from "@/lib/billing/validation";
import {
  createTimeEntry,
  getMatterTimeTotals,
  listTimeEntries,
} from "@/lib/repos/billing";
import { getMatterById, listFirmLawyers, userCanAccessMatter } from "@/lib/repos/matters";
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

export async function GET(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("billing.view");
    const firmId = tenantFirmId(session);
    const { id: matterId } = await context.params;
    const viewAll = canViewAllMatters(session);
    await assertMatterAccess(firmId, matterId, session, viewAll);

    const url = new URL(request.url);
    const includeStaff = url.searchParams.get("includeStaff") === "1";

    const [rows, totals] = await Promise.all([
      listTimeEntries(firmId, matterId),
      getMatterTimeTotals(firmId, matterId),
    ]);

    const payload: Record<string, unknown> = {
      items: rows.map((r) =>
        serializeTimeEntry(r.entry, { userName: r.userName }),
      ),
      totals,
      defaultCurrency: session.firm.defaultCurrency || "USD",
      currentUserId: session.id,
    };

    if (includeStaff) {
      const lawyers = await listFirmLawyers(firmId);
      const staff = lawyers.map((l) => ({ id: l.id, fullName: l.fullName }));
      if (!staff.some((s) => s.id === session.id)) {
        staff.unshift({ id: session.id, fullName: session.fullName });
      }
      payload.staff = staff;
    }

    return jsonOk(payload);
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("billing.manage");
    const firmId = tenantFirmId(session);
    const { id: matterId } = await context.params;
    const viewAll = canViewAllMatters(session);
    await assertMatterAccess(firmId, matterId, session, viewAll);

    const body = await request.json();
    const input = parseTimeEntryInput(body, {
      currency: session.firm.defaultCurrency || "USD",
    });

    const row = await createTimeEntry(firmId, matterId, input);
    const full = await listTimeEntries(firmId, matterId);
    const matched = full.find((r) => r.entry.id === row.id);

    await writeAuditLog({
      action: "time_entries.create",
      firmId,
      userId: session.id,
      entityType: "time_entry",
      entityId: row.id,
      metadata: {
        matterId,
        minutes: row.minutes,
        billable: row.billable,
        rateCents: row.rateCents,
        feeEarnerId: row.userId,
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk(
      {
        entry: serializeTimeEntry(row, {
          userName: matched?.userName ?? null,
        }),
      },
      { status: 201 },
    );
  } catch (err) {
    return jsonError(err, request);
  }
}
