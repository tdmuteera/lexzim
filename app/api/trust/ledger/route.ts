import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { clientDisplayName } from "@/lib/clients/display";
import { serializeTrustLedgerEntry } from "@/lib/trust/serialize";
import { parseTrustLedgerInput } from "@/lib/trust/validation";
import { listTrustLedger, postTrustLedgerEntry } from "@/lib/repos/trust";
import { userCanAccessMatter } from "@/lib/repos/matters";
import { assertCanUse } from "@/lib/licensing/policy";
import { canViewAllMatters, requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

export async function GET(request: Request) {
  try {
    const session = await requirePermission("trust.view");
    const firmId = tenantFirmId(session);
    await assertCanUse(firmId, "trust");
    const url = new URL(request.url);
    const trustAccountId = url.searchParams.get("trustAccountId")?.trim() || undefined;
    const clientId = url.searchParams.get("clientId")?.trim() || undefined;
    const matterId = url.searchParams.get("matterId")?.trim() || undefined;

    if (matterId) {
      const allowed = await userCanAccessMatter(
        firmId,
        matterId,
        session.id,
        canViewAllMatters(session),
      );
      if (!allowed) {
        throw new AuthError("forbidden", "You do not have access to this matter.");
      }
    }

    const rows = await listTrustLedger(firmId, {
      trustAccountId,
      clientId,
      matterId,
    });

    return jsonOk({
      items: rows.map((r) =>
        serializeTrustLedgerEntry(r.entry, {
          accountName: r.accountName,
          matterTitle: r.matterTitle,
          clientDisplayName: r.clientType
            ? clientDisplayName({
                clientType: r.clientType,
                fullName: r.clientFullName,
                legalName: r.clientLegalName,
                tradingName: r.clientTradingName,
              })
            : null,
        }),
      ),
      disclaimer: "Trust ledger only. Fee invoices and fee payments are not included.",
    });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("trust.manage");
    const firmId = tenantFirmId(session);
    await assertCanUse(firmId, "trust");
    const body = await request.json();
    const input = parseTrustLedgerInput(body, {
      currency: session.firm.defaultCurrency || "USD",
    });

    if (input.matterId) {
      const allowed = await userCanAccessMatter(
        firmId,
        input.matterId,
        session.id,
        canViewAllMatters(session),
      );
      if (!allowed) {
        throw new AuthError("forbidden", "You do not have access to this matter.");
      }
    }

    const result = await postTrustLedgerEntry(firmId, session.id, input);

    await writeAuditLog({
      action: "trust_ledger.post",
      firmId,
      userId: session.id,
      entityType: "trust_ledger_entry",
      entityId: result.entries[0]!.id,
      metadata: {
        entryType: input.entryType,
        amountCents: input.amountCents,
        signedAmounts: result.entries.map((e) => e.amountCents),
        trustAccountId: input.trustAccountId,
        transferToAccountId: input.transferToAccountId,
        clientId: input.clientId,
        matterId: input.matterId,
        allowNegative: input.allowNegative,
        note: "Trust ledger only. Not a fee payment.",
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk(
      {
        entries: result.entries.map((e) => serializeTrustLedgerEntry(e)),
      },
      { status: 201 },
    );
  } catch (err) {
    return jsonError(err, request);
  }
}
