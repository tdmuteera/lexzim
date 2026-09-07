import { jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { FEE_CATEGORY_LABELS, type FeeCategory } from "@/lib/finance/payment-intake-validation";
import { getPaymentIntake } from "@/lib/repos/payment-intakes";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("finance.payments.view");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const full = await getPaymentIntake(firmId, id);
    if (!full) throw new AuthError("not_found", "Payment intake not found.");

    return jsonOk({
      intake: {
        id: full.intake.id,
        receiptNumber: full.intake.receiptNumber,
        receivedAt: full.intake.receivedAt.toISOString(),
        amountCents: full.intake.amountCents,
        currency: full.intake.currency,
        destination: full.intake.destination,
        method: full.intake.method,
        reference: full.intake.reference,
        clientId: full.intake.clientId,
        clientName: full.clientName,
        clientNumber: full.clientNumber,
        matterId: full.intake.matterId,
        matterTitle: full.matterTitle,
        matterNumber: full.matterNumber,
        notes: full.intake.notes,
        createdAt: full.intake.createdAt.toISOString(),
        lines: full.lines.map((l) => ({
          id: l.id,
          lineType: l.lineType,
          feeCategory: l.feeCategory,
          feeCategoryLabel:
            l.feeCategory && l.feeCategory in FEE_CATEGORY_LABELS
              ? FEE_CATEGORY_LABELS[l.feeCategory as FeeCategory]
              : l.feeCategory,
          amountCents: l.amountCents,
          invoiceId: l.invoiceId,
          notes: l.notes,
        })),
      },
    });
  } catch (err) {
    return jsonError(err, request);
  }
}
