import { jsonError, jsonOk } from "@/lib/auth/http";
import { clientDisplayName } from "@/lib/clients/display";
import {
  getTrustAccountBalance,
  listVaultBankIns,
  listVaultClientBalances,
  listVaultCounts,
  listTrustAccounts,
} from "@/lib/repos/trust";
import { assertCanUse } from "@/lib/licensing/policy";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

/**
 * GET /api/trust/vault?vaultAccountId=
 * Vault cash overview: balance, client portions, recent bank-ins and counts.
 */
export async function GET(request: Request) {
  try {
    const session = await requirePermission("trust.view");
    const firmId = tenantFirmId(session);
    await assertCanUse(firmId, "trust");

    const url = new URL(request.url);
    const vaultAccountId = url.searchParams.get("vaultAccountId")?.trim() || undefined;

    const vaultAccounts = (await listTrustAccounts(firmId, false)).filter(
      (a) => a.accountKind === "vault",
    );
    const bankAccounts = (await listTrustAccounts(firmId, true)).filter(
      (a) => a.accountKind === "bank",
    );

    const activeVault =
      vaultAccountId
        ? vaultAccounts.find((a) => a.id === vaultAccountId)
        : vaultAccounts.find((a) => a.isActive) ?? vaultAccounts[0];

    if (!activeVault) {
      return jsonOk({
        vaultAccounts: vaultAccounts.map((a) => ({
          id: a.id,
          name: a.name,
          currency: a.currency,
          isActive: a.isActive,
        })),
        bankAccounts: bankAccounts.map((a) => ({
          id: a.id,
          name: a.name,
          currency: a.currency,
        })),
        vault: null,
      });
    }

    const balanceCents = await getTrustAccountBalance(firmId, activeVault.id);
    const clientPortions = await listVaultClientBalances(firmId, activeVault.id);
    const bankIns = await listVaultBankIns(firmId, activeVault.id);
    const counts = await listVaultCounts(firmId, activeVault.id);

    return jsonOk({
      vaultAccounts: vaultAccounts.map((a) => ({
        id: a.id,
        name: a.name,
        currency: a.currency,
        isActive: a.isActive,
      })),
      bankAccounts: bankAccounts.map((a) => ({
        id: a.id,
        name: a.name,
        currency: a.currency,
      })),
      vault: {
        id: activeVault.id,
        name: activeVault.name,
        currency: activeVault.currency,
        balanceCents,
        clientPortions,
        clientPortionsTotalCents: clientPortions.reduce((s, c) => s + c.balanceCents, 0),
        recentBankIns: bankIns.map((r) => ({
          id: r.row.id,
          amountCents: r.row.amountCents,
          currency: r.row.currency,
          occurredAt: r.row.occurredAt.toISOString(),
          vaultName: r.vaultName,
          bankName: r.bankName,
          clientName: r.clientType
            ? clientDisplayName({
                clientType: r.clientType,
                fullName: r.clientFullName,
                legalName: r.clientLegalName,
                tradingName: r.clientTradingName,
              })
            : null,
          reference: r.row.reference,
          narrative: r.row.narrative,
        })),
        recentCounts: counts.map((r) => ({
          id: r.row.id,
          countedAt: r.row.countedAt.toISOString(),
          systemBalanceCents: r.row.systemBalanceCents,
          countedBalanceCents: r.row.countedBalanceCents,
          varianceCents: r.row.varianceCents,
          notes: r.row.notes,
        })),
      },
      disclaimer:
        "Vault cash is client trust money. Not firm petty cash or fee revenue.",
    });
  } catch (err) {
    return jsonError(err, request);
  }
}
