import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { assertInvoiceMatterAccess } from "@/lib/billing/access";
import { serializeInvoice } from "@/lib/billing/serialize";
import {
  isInvoiceStatus,
  isServiceInvoicePayload,
  parseCreateInvoiceInput,
  parseCreateServiceInvoiceInput,
} from "@/lib/billing/validation";
import { clientDisplayName } from "@/lib/clients/display";
import {
  createInvoiceFromServices,
  createInvoiceFromUnbilled,
  getInvoice,
  listInvoices,
  sumFeePaymentsByInvoice,
} from "@/lib/repos/billing";
import { getMatterById, listAccessibleMatterIds, userCanAccessMatter } from "@/lib/repos/matters";
import { canViewAllMatters, requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

export async function GET(request: Request) {
  try {
    const session = await requirePermission("billing.view");
    const firmId = tenantFirmId(session);
    const viewAll = canViewAllMatters(session);
    const url = new URL(request.url);
    const matterId = url.searchParams.get("matterId")?.trim() || undefined;
    const statusRaw = url.searchParams.get("status");
    const status =
      statusRaw && isInvoiceStatus(statusRaw) ? statusRaw : undefined;

    if (matterId) {
      await assertInvoiceMatterAccess(session, firmId, matterId);
    }

    let rows = await listInvoices(firmId, { matterId, status });
    if (!viewAll) {
      const allowed = new Set(
        await listAccessibleMatterIds(firmId, session.id),
      );
      rows = rows.filter((r) => allowed.has(r.invoice.matterId));
    }

    const paidByInvoice = await sumFeePaymentsByInvoice(firmId);
    const items = rows.map((r) =>
      serializeInvoice(r.invoice, {
        matterTitle: r.matterTitle,
        matterNumber: r.matterNumber,
        clientDisplayName: r.clientType
          ? clientDisplayName({
              clientType: r.clientType,
              fullName: r.clientFullName,
              legalName: r.clientLegalName,
              tradingName: r.clientTradingName,
            })
          : null,
        clientNumber: r.clientNumber,
        paidCents: paidByInvoice.get(r.invoice.id) ?? 0,
      }),
    );

    return jsonOk({ items }, { request });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("billing.manage");
    const firmId = tenantFirmId(session);
    const body = await request.json();

    if (isServiceInvoicePayload(body)) {
      const serviceInput = parseCreateServiceInvoiceInput(body);
      const viewAll = canViewAllMatters(session);
      const allowed = await userCanAccessMatter(
        firmId,
        serviceInput.matterId,
        session.id,
        viewAll,
      );
      if (!allowed) {
        throw new AuthError("forbidden", "You do not have access to this matter.");
      }

      const invoice = await createInvoiceFromServices(
        firmId,
        session.id,
        serviceInput,
        { currency: session.firm.defaultCurrency || "USD" },
      );
      const full = await getInvoice(firmId, invoice.id);

      await writeAuditLog({
        action: "invoices.create",
        firmId,
        userId: session.id,
        entityType: "invoice",
        entityId: invoice.id,
        metadata: {
          matterId: invoice.matterId,
          invoiceNumber: invoice.invoiceNumber,
          totalCents: invoice.totalCents,
          source: "service_catalogue",
        },
        ipOrUserAgent: clientInfo(request),
      });

      return jsonOk(
        {
          invoice: full
            ? serializeInvoice(full.invoice, {
                matterTitle: full.matterTitle,
                matterNumber: full.matterNumber,
                clientDisplayName: full.clientType
                  ? clientDisplayName({
                      clientType: full.clientType,
                      fullName: full.clientFullName,
                      legalName: full.clientLegalName,
                      tradingName: full.clientTradingName,
                    })
                  : null,
                clientNumber: full.clientNumber,
                paidCents: 0,
              })
            : serializeInvoice(invoice, { paidCents: 0 }),
        },
        { status: 201, request },
      );
    }

    const input = parseCreateInvoiceInput(body);

    const viewAll = canViewAllMatters(session);
    const allowed = await userCanAccessMatter(
      firmId,
      input.matterId,
      session.id,
      viewAll,
    );
    if (!allowed) {
      throw new AuthError("forbidden", "You do not have access to this matter.");
    }

    const matter = await getMatterById(firmId, input.matterId);
    if (!matter) {
      throw new AuthError("not_found", "Matter not found.");
    }

    const invoice = await createInvoiceFromUnbilled(
      firmId,
      session.id,
      { id: matter.id, clientId: matter.clientId },
      input,
      { currency: session.firm.defaultCurrency || "USD" },
    );

    const full = await getInvoice(firmId, invoice.id);

    await writeAuditLog({
      action: "invoices.create",
      firmId,
      userId: session.id,
      entityType: "invoice",
      entityId: invoice.id,
      metadata: {
        matterId: invoice.matterId,
        invoiceNumber: invoice.invoiceNumber,
        totalCents: invoice.totalCents,
        currency: invoice.currency,
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk(
      {
        invoice: full
          ? serializeInvoice(full.invoice, {
              matterTitle: full.matterTitle,
              matterNumber: full.matterNumber,
              clientDisplayName: full.clientType
                ? clientDisplayName({
                    clientType: full.clientType,
                    fullName: full.clientFullName,
                    legalName: full.clientLegalName,
                    tradingName: full.clientTradingName,
                  })
                : null,
              paidCents: 0,
            })
          : serializeInvoice(invoice, { paidCents: 0 }),
      },
      { status: 201, request },
    );
  } catch (err) {
    return jsonError(err, request);
  }
}
