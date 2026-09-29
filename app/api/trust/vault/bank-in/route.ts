import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { bankVaultCash } from "@/lib/repos/trust";
import { parseVaultBankInInput } from "@/lib/trust/vault-validation";
import { assertCanUse } from "@/lib/licensing/policy";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

/** POST /api/trust/vault/bank-in — move vault cash to master trust bank. */
export async function POST(request: Request) {
  try {
    const session = await requirePermission("trust.manage");
    const firmId = tenantFirmId(session);
    await assertCanUse(firmId, "trust");

    const body = await request.json();
    const parsed = parseVaultBankInInput(body, {
      currency: session.firm.defaultCurrency || "USD",
    });
    let input = parsed;
    if (parsed.allowNegative) {
      if (session.role.code !== "managing_partner") {
        throw new AuthError(
          "forbidden",
          "Only the Managing Partner can authorise a trust balance to go negative.",
        );
      }
      if (!parsed.overrideReason) {
        throw new AuthError("validation", "A reason is required to authorise a negative trust balance.");
      }
      input = { ...parsed, authorisedBy: session.id };
    }

    const result = await bankVaultCash(firmId, session.id, input);

    await writeAuditLog({
      action: "trust_vault.bank_in",
      firmId,
      userId: session.id,
      entityType: "trust_vault_bank_in",
      entityId: result.bankIn.id,
      metadata: {
        vaultAccountId: input.vaultAccountId,
        bankAccountId: input.bankAccountId,
        clientId: input.clientId,
        amountCents: input.amountCents,
        currency: input.currency,
        allowNegative: input.allowNegative,
        overrideReason: input.overrideReason ?? null,
        ledgerEntryIds: result.entries.map((e) => e.id),
        note: "Vault cash banked to trust bank. Client ledger total unchanged; location moved.",
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk(
      {
        bankIn: {
          id: result.bankIn.id,
          amountCents: result.bankIn.amountCents,
          currency: result.bankIn.currency,
          occurredAt: result.bankIn.occurredAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (err) {
    return jsonError(err, request);
  }
}
