import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { reversePaymentIntake } from "@/lib/repos/payment-intakes";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/finance/payments/:id/reverse { reason } : unwinds every posting of the intake. */
export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("finance.payments.create");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!reason) throw new AuthError("validation", "A reason is required to reverse a payment.");

    const full = await reversePaymentIntake(firmId, session.id, id, reason);

    await writeAuditLog({
      action: "finance_payment_intakes.reverse",
      firmId,
      userId: session.id,
      entityType: "finance_payment_intake",
      entityId: id,
      metadata: {
        reason,
        receiptNumber: full?.intake.receiptNumber ?? null,
        amountCents: full?.intake.amountCents ?? null,
        clientId: full?.intake.clientId ?? null,
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ ok: true, reversedAt: full?.intake.reversedAt?.toISOString() ?? null });
  } catch (err) {
    return jsonError(err, request);
  }
}
