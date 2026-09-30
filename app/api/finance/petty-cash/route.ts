import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { parseExpenseInput } from "@/lib/finance/firm-finance-validation";
import { listCashMovements } from "@/lib/repos/firm-cash";
import { createFirmExpense } from "@/lib/repos/firm-finance";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

/** GET /api/finance/petty-cash : petty cash balance (GL 1050) and every posting on it. */
export async function GET(request: Request) {
  try {
    const session = await requirePermission("finance.view");
    const firmId = tenantFirmId(session);
    const movements = await listCashMovements(firmId, "1050");
    return jsonOk({
      balanceCents: movements[0]?.balanceAfterCents ?? 0,
      movements: movements.map((m) => ({
        ...m,
        entryDate: m.entryDate.toISOString(),
        postedAt: m.postedAt.toISOString(),
      })),
    });
  } catch (err) {
    return jsonError(err, request);
  }
}

/**
 * POST /api/finance/petty-cash : record a petty cash spend as a firm expense paid from GL 1050.
 * Top-ups and returns go through /api/finance/transfers.
 */
export async function POST(request: Request) {
  try {
    const session = await requirePermission("finance.post");
    const firmId = tenantFirmId(session);
    const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (raw.action && raw.action !== "spend") {
      throw new AuthError(
        "validation",
        "Petty cash is topped up or returned through Funds Transfer. Only spend is recorded here.",
      );
    }
    const input = parseExpenseInput(
      { ...raw, paymentSource: "petty" },
      { currency: session.firm.defaultCurrency || "USD" },
    );
    const expense = await createFirmExpense(firmId, session.id, input);
    await writeAuditLog({
      action: "petty_cash.spend",
      firmId,
      userId: session.id,
      entityType: "firm_expense",
      entityId: expense.id,
      metadata: { amountCents: expense.amountCents, category: expense.category, payee: expense.payee },
      ipOrUserAgent: clientInfo(request),
    });
    return jsonOk({ expenseId: expense.id }, { status: 201 });
  } catch (err) {
    return jsonError(err, request);
  }
}
