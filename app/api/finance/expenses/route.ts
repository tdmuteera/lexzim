import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { parseExpenseInput } from "@/lib/finance/firm-finance-validation";
import { legacyCategoryLabel, listExpenseGlOptions } from "@/lib/finance/expense-gl-tree";
import { createFirmExpense, getFirmExpense, listFirmExpenses } from "@/lib/repos/firm-finance";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

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
    categoryLabel: legacyCategoryLabel(row.expense.category),
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

export async function GET(request: Request) {
  try {
    const session = await requirePermission("finance.view");
    const firmId = tenantFirmId(session);
    const url = new URL(request.url);
    const category = url.searchParams.get("category")?.trim() || undefined;

    const rows = await listFirmExpenses(firmId, { category });
    const glOptions = await listExpenseGlOptions(firmId);
    return jsonOk({
      categories: glOptions.map((o) => ({
        id: o.code,
        label: o.label,
        glAccountId: o.glAccountId ?? null,
      })),
      items: rows.map(serializeExpense),
    });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("finance.post");
    const firmId = tenantFirmId(session);
    const body = await request.json();
    const input = parseExpenseInput(body, {
      currency: session.firm.defaultCurrency || "USD",
    });
    const expense = await createFirmExpense(firmId, session.id, input);

    await writeAuditLog({
      action: "firm_expenses.create",
      firmId,
      userId: session.id,
      entityType: "firm_expense",
      entityId: expense.id,
      metadata: {
        category: expense.category,
        amountCents: expense.amountCents,
        payee: expense.payee,
        note: "Firm operating expense. Not trust.",
      },
      ipOrUserAgent: clientInfo(request),
    });

    const full = await getFirmExpense(firmId, expense.id);
    return jsonOk(
      { expense: full ? serializeExpense(full) : serializeExpense({ expense }) },
      { status: 201 },
    );
  } catch (err) {
    return jsonError(err, request);
  }
}
