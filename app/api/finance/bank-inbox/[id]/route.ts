import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import {
  closeBankImport,
  getBankImport,
  importCounts,
  listBankImportLines,
} from "@/lib/repos/bank-statements";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("finance.reconcile");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const imp = await getBankImport(firmId, id);
    if (!imp) throw new AuthError("not_found", "Import not found.");
    const url = new URL(request.url);
    const status = url.searchParams.get("status")?.trim() || undefined;
    const lines = await listBankImportLines(firmId, id, { status });
    const counts = await importCounts(firmId, id);
    return jsonOk({ import: imp, lines, counts }, { request });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("finance.reconcile");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { action?: string };
    if (body.action !== "close") {
      throw new AuthError("validation", "Supported action: close.");
    }
    const closed = await closeBankImport(firmId, id);
    if (!closed) throw new AuthError("not_found", "Import not found.");

    await writeAuditLog({
      action: "bank_inbox.close",
      firmId,
      userId: session.id,
      entityType: "bank_statement_import",
      entityId: id,
      metadata: {},
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ import: closed }, { request });
  } catch (err) {
    return jsonError(err, request);
  }
}
