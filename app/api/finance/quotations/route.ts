import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { isQuoteStatus } from "@/lib/quotes/totals";
import { parseCreateQuotationInput } from "@/lib/quotes/validation";
import { serializeQuotationListItem } from "@/lib/quotes/serialize";
import { createQuotation, listQuotations } from "@/lib/repos/quotations";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

function parseDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new AuthError("validation", `Invalid date: ${value}`);
  return d;
}

export async function GET(request: Request) {
  try {
    const session = await requirePermission("billing.view");
    const firmId = tenantFirmId(session);
    const url = new URL(request.url);
    const statusRaw = url.searchParams.get("status");
    const status = statusRaw && isQuoteStatus(statusRaw) ? statusRaw : undefined;
    const clientId = url.searchParams.get("clientId")?.trim() || undefined;
    const from = parseDate(url.searchParams.get("from"));
    const to = parseDate(url.searchParams.get("to"));

    const rows = await listQuotations(firmId, { status, clientId, from, to });
    return jsonOk({ items: rows.map(serializeQuotationListItem) });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("finance.quote.manage");
    const firmId = tenantFirmId(session);
    const body = await request.json();
    const input = parseCreateQuotationInput(body);
    const quote = await createQuotation(
      firmId,
      session.id,
      input,
      session.firm.defaultCurrency || "USD",
    );

    await writeAuditLog({
      action: "quotations.create",
      firmId,
      userId: session.id,
      entityType: "quotation",
      entityId: quote.id,
      metadata: { quoteNumber: quote.quoteNumber, clientId: quote.clientId },
      ipOrUserAgent: clientInfo(request),
    });

    const rows = await listQuotations(firmId);
    const created = rows.find((r) => r.quote.id === quote.id);
    return jsonOk(
      { quotation: created ? serializeQuotationListItem(created) : { id: quote.id } },
      { status: 201 },
    );
  } catch (err) {
    return jsonError(err);
  }
}
