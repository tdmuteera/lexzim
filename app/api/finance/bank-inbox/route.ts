import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { parseCreateImportInput } from "@/lib/finance/bank-inbox-validation";
import {
  createBankImport,
  listBankImports,
} from "@/lib/repos/bank-statements";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

export async function GET(request: Request) {
  try {
    const session = await requirePermission("finance.reconcile");
    const firmId = tenantFirmId(session);
    const items = await listBankImports(firmId);
    return jsonOk({ items }, { request });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("finance.reconcile");
    const firmId = tenantFirmId(session);
    const body = await request.json();
    const input = parseCreateImportInput(body);
    const result = await createBankImport(firmId, session.id, input);

    await writeAuditLog({
      action: "bank_inbox.import",
      firmId,
      userId: session.id,
      entityType: "bank_statement_import",
      entityId: result.import!.id,
      metadata: {
        accountKind: input.accountKind,
        inserted: result.inserted,
        skippedDup: result.skippedDup,
        sourceFilename: input.sourceFilename,
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk(result, { status: 201, request });
  } catch (err) {
    return jsonError(err, request);
  }
}
