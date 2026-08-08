import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import {
  serializeTrustAccount,
} from "@/lib/trust/serialize";
import { parseTrustAccountInput } from "@/lib/trust/validation";
import {
  createTrustAccount,
  getTrustAccountBalance,
  listTrustAccounts,
} from "@/lib/repos/trust";
import { assertCanUse } from "@/lib/licensing/policy";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

export async function GET(request: Request) {
  try {
    const session = await requirePermission("trust.view");
    const firmId = tenantFirmId(session);
    await assertCanUse(firmId, "trust");
    const url = new URL(request.url);
    const activeOnly = url.searchParams.get("active") !== "all";
    const rows = await listTrustAccounts(firmId, activeOnly);
    const items = await Promise.all(
      rows.map(async (row) =>
        serializeTrustAccount(row, {
          balanceCents: await getTrustAccountBalance(firmId, row.id),
        }),
      ),
    );
    return jsonOk({ items });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("trust.manage");
    const firmId = tenantFirmId(session);
    await assertCanUse(firmId, "trust");
    const body = await request.json();
    const input = parseTrustAccountInput(body, {
      currency: session.firm.defaultCurrency || "USD",
    });
    const row = await createTrustAccount(firmId, input);

    await writeAuditLog({
      action: "trust_accounts.create",
      firmId,
      userId: session.id,
      entityType: "trust_account",
      entityId: row.id,
      metadata: { name: row.name, currency: row.currency },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk(
      { account: serializeTrustAccount(row, { balanceCents: 0 }) },
      { status: 201 },
    );
  } catch (err) {
    return jsonError(err);
  }
}
