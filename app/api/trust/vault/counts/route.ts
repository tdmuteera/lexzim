import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { recordVaultCount } from "@/lib/repos/trust";
import { parseVaultCountInput } from "@/lib/trust/vault-validation";
import { assertCanUse } from "@/lib/licensing/policy";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

/** POST /api/trust/vault/counts — record physical vault count vs system balance. */
export async function POST(request: Request) {
  try {
    const session = await requirePermission("trust.manage");
    const firmId = tenantFirmId(session);
    await assertCanUse(firmId, "trust");

    const body = await request.json();
    const input = parseVaultCountInput(body);

    const result = await recordVaultCount(firmId, session.id, input);

    await writeAuditLog({
      action: "trust_vault.count",
      firmId,
      userId: session.id,
      entityType: "trust_vault_count",
      entityId: result.count.id,
      metadata: {
        vaultAccountId: input.vaultAccountId,
        systemBalanceCents: result.systemBalanceCents,
        countedBalanceCents: input.countedBalanceCents,
        varianceCents: result.varianceCents,
        notes: input.notes,
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk(
      {
        count: {
          id: result.count.id,
          countedAt: result.count.countedAt.toISOString(),
          systemBalanceCents: result.systemBalanceCents,
          countedBalanceCents: result.count.countedBalanceCents,
          varianceCents: result.varianceCents,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    return jsonError(err, request);
  }
}
