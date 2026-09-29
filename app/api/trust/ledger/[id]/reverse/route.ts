import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { assertCanUse } from "@/lib/licensing/policy";
import { requirePermission } from "@/lib/rbac/guards";
import { reverseTrustFee } from "@/lib/repos/finance-movements";
import { getTrustLedgerEntry, reverseTrustEntry } from "@/lib/repos/trust";
import { tenantFirmId } from "@/lib/tenant/scope";
import { serializeTrustLedgerEntry } from "@/lib/trust/serialize";

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/trust/ledger/:id/reverse { reason } : contra entry, original kept and linked. */
export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("trust.manage");
    const firmId = tenantFirmId(session);
    await assertCanUse(firmId, "trust");
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!reason) throw new AuthError("validation", "A reason is required to reverse a trust entry.");

    const entry = await getTrustLedgerEntry(firmId, id);
    if (!entry) throw new AuthError("not_found", "Trust entry not found.");
    const result =
      entry.sourceType === "invoice_fee"
        ? await reverseTrustFee(firmId, session.id, id, reason).then((r) => ({
            original: [r.original],
            reversals: [r.reversal],
          }))
        : await reverseTrustEntry(
            firmId,
            { id: session.id, isManagingPartner: session.role.code === "managing_partner" },
            id,
            reason,
          );

    await writeAuditLog({
      action: "trust_ledger.reverse",
      firmId,
      userId: session.id,
      entityType: "trust_ledger_entry",
      entityId: id,
      metadata: {
        reason,
        originalIds: result.original.map((e) => e.id),
        reversalIds: result.reversals.map((e) => e.id),
        amounts: result.reversals.map((e) => e.amountCents),
        clientIds: result.reversals.map((e) => e.clientId),
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk(
      { reversals: result.reversals.map((e) => serializeTrustLedgerEntry(e)) },
      { status: 201 },
    );
  } catch (err) {
    return jsonError(err, request);
  }
}
