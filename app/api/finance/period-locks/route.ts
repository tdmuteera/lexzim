import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { listPeriodLocks, lockFinancePeriod } from "@/lib/repos/period-locks";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

function parsePeriod(body: { year?: number; month?: number }) {
  const year = Number(body.year);
  const month = Number(body.month);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new AuthError("validation", "year must be a valid year (2000-2100).");
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new AuthError("validation", "month must be between 1 and 12.");
  }
  return { year, month };
}

/**
 * GET /api/finance/period-locks
 * POST /api/finance/period-locks { year, month }
 */
export async function GET(request: Request) {
  try {
    const session = await requirePermission("finance.view");
    const firmId = tenantFirmId(session);
    const rows = await listPeriodLocks(firmId);
    return jsonOk({
      locks: rows.map((r) => ({
        id: r.lock.id,
        periodYear: r.lock.periodYear,
        periodMonth: r.lock.periodMonth,
        lockedAt: r.lock.lockedAt.toISOString(),
        lockedByName: r.lockedByName,
      })),
    });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("finance.close_month");
    const firmId = tenantFirmId(session);
    const body = await request.json();
    const { year, month } = parsePeriod(body);

    const lock = await lockFinancePeriod(firmId, session.id, year, month);

    await writeAuditLog({
      action: "finance.period_lock",
      firmId,
      userId: session.id,
      entityType: "finance_period_lock",
      entityId: lock.id,
      metadata: {
        periodYear: year,
        periodMonth: month,
        note: "Month-end period locked for finance postings.",
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk(
      {
        lock: {
          id: lock.id,
          periodYear: lock.periodYear,
          periodMonth: lock.periodMonth,
          lockedAt: lock.lockedAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (err) {
    return jsonError(err, request);
  }
}
