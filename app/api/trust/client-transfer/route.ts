import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { dollarsToCents } from "@/lib/billing/money";
import { assertCanUse } from "@/lib/licensing/policy";
import { requirePermission } from "@/lib/rbac/guards";
import { postClientToClientTransfer } from "@/lib/repos/trust";
import { tenantFirmId } from "@/lib/tenant/scope";
import { serializeTrustLedgerEntry } from "@/lib/trust/serialize";

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** POST /api/trust/client-transfer : Managing Partner moves trust money between clients, with reason. */
export async function POST(request: Request) {
  try {
    const session = await requirePermission("trust.manage");
    const firmId = tenantFirmId(session);
    await assertCanUse(firmId, "trust");
    const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const trustAccountId = str(raw.trustAccountId);
    const fromClientId = str(raw.fromClientId);
    const toClientId = str(raw.toClientId);
    if (!trustAccountId || !fromClientId || !toClientId) {
      throw new AuthError("validation", "Trust account, paying client and receiving client are required.");
    }
    const amountCents =
      raw.amountCents != null ? Number(raw.amountCents) : dollarsToCents(raw.amountDollars);
    if (amountCents == null || !Number.isInteger(amountCents) || amountCents < 1) {
      throw new AuthError("validation", "Amount must be greater than zero.");
    }
    const occurredAt = str(raw.occurredAt) ? new Date(str(raw.occurredAt)!) : new Date();
    if (Number.isNaN(occurredAt.getTime())) throw new AuthError("validation", "Invalid date.");

    const result = await postClientToClientTransfer(
      firmId,
      { id: session.id, isManagingPartner: session.role.code === "managing_partner" },
      {
        trustAccountId,
        fromClientId,
        fromMatterId: str(raw.fromMatterId),
        toClientId,
        toMatterId: str(raw.toMatterId),
        amountCents,
        occurredAt,
        reason: str(raw.reason) ?? "",
        reference: str(raw.reference),
        idempotencyKey: str(raw.idempotencyKey),
      },
    );

    await writeAuditLog({
      action: "trust_ledger.client_transfer",
      firmId,
      userId: session.id,
      entityType: "trust_ledger_entry",
      entityId: result.entries[0]!.id,
      metadata: {
        fromClientId,
        toClientId,
        amountCents,
        trustAccountId,
        reason: str(raw.reason),
        entryIds: result.entries.map((e) => e.id),
        replayed: "replayed" in result && result.replayed === true,
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk(
      { entries: result.entries.map((e) => serializeTrustLedgerEntry(e)) },
      { status: 201 },
    );
  } catch (err) {
    return jsonError(err, request);
  }
}
