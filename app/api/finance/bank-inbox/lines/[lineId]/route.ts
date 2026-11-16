import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import {
  parseMatchLineInput,
  parsePostExpenseFromLineInput,
} from "@/lib/finance/bank-inbox-validation";
import {
  getBankLine,
  ignoreBankLine,
  matchBankLine,
  postCashbookInFromBankLine,
  postExpenseFromBankLine,
  suggestMatchesForLine,
} from "@/lib/repos/bank-statements";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ lineId: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("finance.reconcile");
    const firmId = tenantFirmId(session);
    const { lineId } = await context.params;
    const line = await getBankLine(firmId, lineId);
    if (!line) throw new AuthError("not_found", "Bank line not found.");
    const candidates = await suggestMatchesForLine(firmId, lineId);
    return jsonOk({ line, candidates }, { request });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("finance.reconcile");
    const firmId = tenantFirmId(session);
    const { lineId } = await context.params;
    const body = await request.json();
    const action = typeof body?.action === "string" ? body.action : "";

    if (action === "match") {
      const input = parseMatchLineInput(body);
      const line = await matchBankLine(firmId, lineId, input);
      await writeAuditLog({
        action: "bank_inbox.match",
        firmId,
        userId: session.id,
        entityType: "bank_statement_line",
        entityId: lineId,
        metadata: input,
        ipOrUserAgent: clientInfo(request),
      });
      return jsonOk({ line }, { request });
    }

    if (action === "ignore") {
      const line = await ignoreBankLine(firmId, lineId);
      await writeAuditLog({
        action: "bank_inbox.ignore",
        firmId,
        userId: session.id,
        entityType: "bank_statement_line",
        entityId: lineId,
        metadata: {},
        ipOrUserAgent: clientInfo(request),
      });
      return jsonOk({ line }, { request });
    }

    if (action === "post_expense") {
      const input = parsePostExpenseFromLineInput(body);
      const result = await postExpenseFromBankLine(firmId, session.id, lineId, input);
      await writeAuditLog({
        action: "bank_inbox.post_expense",
        firmId,
        userId: session.id,
        entityType: "bank_statement_line",
        entityId: lineId,
        metadata: { expenseId: result.expense.id, category: input.category },
        ipOrUserAgent: clientInfo(request),
      });
      return jsonOk(result, { request });
    }

    if (action === "post_cashbook_in") {
      const notes = typeof body.notes === "string" ? body.notes : null;
      const result = await postCashbookInFromBankLine(firmId, session.id, lineId, notes);
      await writeAuditLog({
        action: "bank_inbox.post_cashbook_in",
        firmId,
        userId: session.id,
        entityType: "bank_statement_line",
        entityId: lineId,
        metadata: { cashbookId: result.entry.id },
        ipOrUserAgent: clientInfo(request),
      });
      return jsonOk(result, { request });
    }

    throw new AuthError(
      "validation",
      "action must be match, ignore, post_expense, or post_cashbook_in.",
    );
  } catch (err) {
    return jsonError(err, request);
  }
}
