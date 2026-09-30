import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { requirePermission } from "@/lib/rbac/guards";
import {
  fundFloat,
  getFloatBalanceCents,
  listFloatJournals,
  returnFloatExcess,
} from "@/lib/repos/disbursement-float";
import { FLOAT_MONTHLY_TARGET_CENTS } from "@/lib/repos/firm-cash";
import { tenantFirmId } from "@/lib/tenant/scope";

/** GET /api/finance/float : disbursement float balance and recent movements. */
export async function GET(request: Request) {
  try {
    const session = await requirePermission("finance.view");
    const firmId = tenantFirmId(session);
    const [balanceCents, movements] = await Promise.all([
      getFloatBalanceCents(firmId),
      listFloatJournals(firmId),
    ]);
    return jsonOk({
      balanceCents,
      targetCents: FLOAT_MONTHLY_TARGET_CENTS,
      movements: movements.map((m) => ({
        entryId: m.id,
        entryDate: m.entryDate.toISOString(),
        memo: m.memo,
        sourceType: m.sourceType,
        sourceId: m.sourceId,
        amountCents: m.debitCents - m.creditCents,
      })),
    });
  } catch (err) {
    return jsonError(err, request);
  }
}

/**
 * POST /api/finance/float
 *   { action: "fund", amountCents, fromAccount: "1010" | "1020", note? }
 *   { action: "return", amountCents, toAccount: "1010" | "1020", reason }  (Managing Partner)
 */
export async function POST(request: Request) {
  try {
    const session = await requirePermission("finance.post");
    const firmId = tenantFirmId(session);
    const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = raw.action;
    const note = typeof raw.note === "string" ? raw.note.trim() || null : null;
    const reason = typeof raw.reason === "string" ? raw.reason : null;

    let result;
    if (action === "fund") {
      result = await fundFloat(firmId, session.id, {
        amountCents: raw.amountCents,
        fromAccount: raw.fromAccount,
        note,
      });
    } else if (action === "return") {
      result = await returnFloatExcess(
        firmId,
        session.id,
        { amountCents: raw.amountCents, toAccount: raw.toAccount, reason },
        { isManagingPartner: session.role.code === "managing_partner" },
      );
    } else {
      throw new AuthError("validation", "action must be fund or return.");
    }

    await writeAuditLog({
      action: `disbursement_float.${action}`,
      firmId,
      userId: session.id,
      entityType: "gl_journal_entry",
      entityId: result.entry.id,
      metadata: {
        amountCents: raw.amountCents,
        account: action === "fund" ? raw.fromAccount : raw.toAccount,
        note,
        reason,
        balanceCents: result.balanceCents,
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ balanceCents: result.balanceCents, entryId: result.entry.id }, { status: 201 });
  } catch (err) {
    return jsonError(err, request);
  }
}
