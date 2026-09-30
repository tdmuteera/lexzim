import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import {
  FLOAT_MONTHLY_TARGET_CENTS,
  getFirmCashPositions,
  listFirmTransfers,
  reverseFirmTransfer,
  transferFirmFunds,
} from "@/lib/repos/firm-cash";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

/** GET /api/finance/transfers : firm cash positions and transfer history. */
export async function GET(request: Request) {
  try {
    const session = await requirePermission("finance.view");
    const firmId = tenantFirmId(session);
    const [positions, transfers] = await Promise.all([
      getFirmCashPositions(firmId),
      listFirmTransfers(firmId),
    ]);
    return jsonOk({
      positions,
      floatTargetCents: FLOAT_MONTHLY_TARGET_CENTS,
      canReverse: session.role.code === "managing_partner",
      transfers: transfers.map((t) => ({ ...t, entryDate: t.entryDate.toISOString() })),
    });
  } catch (err) {
    return jsonError(err, request);
  }
}

/**
 * POST /api/finance/transfers
 *   { fromAccount, toAccount, amountCents, entryDate?, note? }
 *   { action: "reverse", entryId, reason }  (Managing Partner)
 */
export async function POST(request: Request) {
  try {
    const session = await requirePermission("finance.post");
    const firmId = tenantFirmId(session);
    const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const isManagingPartner = session.role.code === "managing_partner";

    if (raw.action === "reverse") {
      if (typeof raw.entryId !== "string") throw new AuthError("validation", "entryId is required.");
      const reason = typeof raw.reason === "string" ? raw.reason : null;
      const { reversal, row } = await reverseFirmTransfer(firmId, session.id, raw.entryId, reason, {
        isManagingPartner,
      });
      await writeAuditLog({
        action: "funds_transfer.reverse",
        firmId,
        userId: session.id,
        entityType: "gl_journal_entry",
        entityId: reversal.id,
        metadata: {
          originalEntryId: row.entryId,
          fromAccount: row.fromCode,
          toAccount: row.toCode,
          amountCents: row.amountCents,
          reason,
        },
        ipOrUserAgent: clientInfo(request),
      });
      return jsonOk({ entryId: reversal.id }, { status: 201 });
    }

    let entryDate: Date | null = null;
    if (typeof raw.entryDate === "string" && raw.entryDate.trim()) {
      entryDate = new Date(raw.entryDate);
      if (Number.isNaN(entryDate.getTime())) throw new AuthError("validation", "Date is invalid.");
    }
    const note = typeof raw.note === "string" ? raw.note : null;
    const result = await transferFirmFunds(
      firmId,
      session.id,
      { fromAccount: raw.fromAccount, toAccount: raw.toAccount, amountCents: raw.amountCents, entryDate, note },
      { isManagingPartner, currency: session.firm.defaultCurrency || "USD" },
    );
    await writeAuditLog({
      action: "funds_transfer.create",
      firmId,
      userId: session.id,
      entityType: "gl_journal_entry",
      entityId: result.entry.id,
      metadata: {
        fromAccount: result.from,
        toAccount: result.to,
        amountCents: result.amountCents,
        note,
      },
      ipOrUserAgent: clientInfo(request),
    });
    return jsonOk({ entryId: result.entry.id }, { status: 201 });
  } catch (err) {
    return jsonError(err, request);
  }
}
