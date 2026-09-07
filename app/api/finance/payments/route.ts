import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { dollarsToCents } from "@/lib/billing/money";
import {
  FEE_CATEGORIES,
  FEE_CATEGORY_LABELS,
  PAYMENT_DESTINATIONS,
  parsePaymentIntakeInput,
} from "@/lib/finance/payment-intake-validation";
import {
  createPaymentIntake,
  listPaymentIntakes,
} from "@/lib/repos/payment-intakes";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

function serializeIntakeListItem(row: Awaited<ReturnType<typeof listPaymentIntakes>>[number]) {
  return {
    id: row.intake.id,
    receiptNumber: row.intake.receiptNumber,
    receivedAt: row.intake.receivedAt.toISOString(),
    amountCents: row.intake.amountCents,
    currency: row.intake.currency,
    destination: row.intake.destination,
    method: row.intake.method,
    reference: row.intake.reference,
    clientId: row.intake.clientId,
    clientName: row.clientName,
    clientNumber: row.clientNumber,
    matterId: row.intake.matterId,
    matterTitle: row.matterTitle,
    matterNumber: row.matterNumber,
    lineCount: row.lineCount,
    notes: row.intake.notes,
    createdAt: row.intake.createdAt.toISOString(),
  };
}

export async function GET(request: Request) {
  try {
    const session = await requirePermission("finance.payments.view");
    const firmId = tenantFirmId(session);
    const url = new URL(request.url);

    const fromRaw = url.searchParams.get("from");
    const toRaw = url.searchParams.get("to");
    const minRaw = url.searchParams.get("minAmount");
    const maxRaw = url.searchParams.get("maxAmount");

    const items = await listPaymentIntakes(firmId, {
      clientId: url.searchParams.get("clientId")?.trim() || undefined,
      matterId: url.searchParams.get("matterId")?.trim() || undefined,
      destination: url.searchParams.get("destination")?.trim() || undefined,
      from: fromRaw ? new Date(fromRaw) : undefined,
      to: toRaw ? new Date(toRaw) : undefined,
      minAmountCents: minRaw ? dollarsToCents(minRaw) ?? undefined : undefined,
      maxAmountCents: maxRaw ? dollarsToCents(maxRaw) ?? undefined : undefined,
    });

    return jsonOk({
      destinations: PAYMENT_DESTINATIONS,
      feeCategories: FEE_CATEGORIES.map((id) => ({
        id,
        label: FEE_CATEGORY_LABELS[id],
      })),
      items: items.map(serializeIntakeListItem),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/relation .* does not exist|undefined_table/i.test(msg)) {
      return jsonError(
        new AuthError(
          "failed",
          "Payments tables are missing on this database. Run migration 0045_phase11_finance_depth, then refresh.",
        ),
        request,
      );
    }
    return jsonError(err, request);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("finance.payments.create");
    const firmId = tenantFirmId(session);
    const body = await request.json();
    const input = parsePaymentIntakeInput(body, {
      currency: session.firm.defaultCurrency || "USD",
    });

    const full = await createPaymentIntake(firmId, session.id, input);
    if (!full) {
      throw new AuthError("server", "Payment intake could not be loaded after create.");
    }

    await writeAuditLog({
      action: "finance_payment_intakes.create",
      firmId,
      userId: session.id,
      entityType: "finance_payment_intake",
      entityId: full.intake.id,
      metadata: {
        receiptNumber: full.intake.receiptNumber,
        amountCents: full.intake.amountCents,
        destination: full.intake.destination,
        clientId: full.intake.clientId,
        matterId: full.intake.matterId,
        lineTypes: full.lines.map((l) => l.lineType),
        note: "Cash event intake. Trust and fee ledgers stay separate.",
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk(
      {
        intake: {
          ...serializeIntakeListItem({
            intake: full.intake,
            clientName: full.clientName,
            clientNumber: full.clientNumber,
            matterTitle: full.matterTitle,
            matterNumber: full.matterNumber,
            lineCount: full.lines.length,
          }),
          lines: full.lines.map((l) => ({
            id: l.id,
            lineType: l.lineType,
            feeCategory: l.feeCategory,
            amountCents: l.amountCents,
            invoiceId: l.invoiceId,
            notes: l.notes,
          })),
        },
      },
      { status: 201 },
    );
  } catch (err) {
    return jsonError(err, request);
  }
}
