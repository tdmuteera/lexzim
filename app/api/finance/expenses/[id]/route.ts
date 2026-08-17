import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/finance/expense-categories";
import { parseExpenseInput } from "@/lib/finance/firm-finance-validation";
import {
  deleteFirmExpense,
  getFirmExpense,
  listFirmExpenses,
  updateFirmExpense,
} from "@/lib/repos/firm-finance";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

function serializeExpense(row: {
  expense: {
    id: string;
    expenseDate: Date;
    category: string;
    payee: string;
    amountCents: number;
    currency: string;
    matterId: string | null;
    paymentMethod: string | null;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  matterTitle?: string | null;
  matterNumber?: string | null;
}) {
  return {
    id: row.expense.id,
    expenseDate: row.expense.expenseDate.toISOString(),
    category: row.expense.category,
    categoryLabel:
      EXPENSE_CATEGORY_LABELS[row.expense.category as keyof typeof EXPENSE_CATEGORY_LABELS] ??
      row.expense.category,
    payee: row.expense.payee,
    amountCents: row.expense.amountCents,
    currency: row.expense.currency,
    matterId: row.expense.matterId,
    matterTitle: row.matterTitle ?? null,
    matterNumber: row.matterNumber ?? null,
    paymentMethod: row.expense.paymentMethod,
    notes: row.expense.notes,
    createdAt: row.expense.createdAt.toISOString(),
    updatedAt: row.expense.updatedAt.toISOString(),
  };
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("finance.post");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const body = await request.json();
    const input = parseExpenseInput(body, {
      currency: session.firm.defaultCurrency || "USD",
    });

    const expense = await updateFirmExpense(firmId, id, input);
    if (!expense) throw new AuthError("not_found", "Expense not found.");

    await writeAuditLog({
      action: "firm_expenses.update",
      firmId,
      userId: session.id,
      entityType: "firm_expense",
      entityId: id,
      metadata: { category: expense.category, amountCents: expense.amountCents },
      ipOrUserAgent: clientInfo(request),
    });

    const full = await getFirmExpense(firmId, id);
    return jsonOk({ expense: full ? serializeExpense(full) : serializeExpense({ expense }) });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("finance.post");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;

    const expense = await deleteFirmExpense(firmId, id);
    if (!expense) throw new AuthError("not_found", "Expense not found.");

    await writeAuditLog({
      action: "firm_expenses.delete",
      firmId,
      userId: session.id,
      entityType: "firm_expense",
      entityId: id,
      metadata: { payee: expense.payee, amountCents: expense.amountCents },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ deleted: true });
  } catch (err) {
    return jsonError(err, request);
  }
}
