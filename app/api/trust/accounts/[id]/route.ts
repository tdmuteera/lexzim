import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { serializeTrustAccount } from "@/lib/trust/serialize";
import { parseTrustAccountInput } from "@/lib/trust/validation";
import {
  getTrustAccount,
  getTrustAccountBalance,
  updateTrustAccount,
} from "@/lib/repos/trust";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("trust.view");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const row = await getTrustAccount(firmId, id);
    if (!row) throw new AuthError("not_found", "Trust account not found.");
    const balanceCents = await getTrustAccountBalance(firmId, id);
    return jsonOk({ account: serializeTrustAccount(row, { balanceCents }) });
  } catch (err) {
    return jsonError(err);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("trust.manage");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const existing = await getTrustAccount(firmId, id);
    if (!existing) throw new AuthError("not_found", "Trust account not found.");

    const body = await request.json();
    const input = parseTrustAccountInput(body, { currency: existing.currency });
    const row = await updateTrustAccount(firmId, id, input);
    if (!row) throw new AuthError("not_found", "Trust account not found.");

    await writeAuditLog({
      action: "trust_accounts.update",
      firmId,
      userId: session.id,
      entityType: "trust_account",
      entityId: row.id,
      metadata: { name: row.name, isActive: row.isActive },
      ipOrUserAgent: clientInfo(request),
    });

    const balanceCents = await getTrustAccountBalance(firmId, id);
    return jsonOk({ account: serializeTrustAccount(row, { balanceCents }) });
  } catch (err) {
    return jsonError(err);
  }
}
