import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import {
  documentAttachmentFilename,
  resolveDocumentRecipient,
} from "@/lib/email/document-send";
import { normalizeEmailAddress, sendFirmEmail } from "@/lib/email/mailer";
import { draftInvoiceReminderMessage } from "@/lib/finance/debtor-reminders";
import { renderExport } from "@/lib/export/registry";
import { createDebtorCommunication } from "@/lib/repos/debtor-communications";
import { listDebtors } from "@/lib/repos/debtors";
import { canViewAllMatters, hasPermission, requireAny } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

/**
 * Draft and optionally send payment reminders for outstanding fee invoices.
 * Manual only (no silent cron). Always logs a debtor communication when sending
 * or when explicitly logging a draft.
 *
 * POST { invoiceIds: string[], send?: boolean, to?: string, logOnly?: boolean }
 */
export async function POST(request: Request) {
  try {
    const session = await requireAny(["billing.view", "billing.manage"]);
    const firmId = tenantFirmId(session);
    const viewAll =
      canViewAllMatters(session) && hasPermission(session, "billing.view");
    const body = (await request.json()) as {
      invoiceIds?: unknown;
      send?: boolean;
      to?: string;
      logOnly?: boolean;
      subject?: string;
      message?: string;
    };

    const invoiceIds = Array.isArray(body.invoiceIds)
      ? body.invoiceIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim()))
      : [];
    if (!invoiceIds.length) {
      throw new AuthError("validation", "invoiceIds is required.");
    }
    if (invoiceIds.length > 40) {
      throw new AuthError("validation", "At most 40 invoices per reminder batch.");
    }

    const report = await listDebtors(firmId, {
      userId: session.id,
      viewAll,
    });
    const idSet = new Set(invoiceIds);
    const rows = report.rows.filter((r) => idSet.has(r.invoiceId));
    if (!rows.length) {
      throw new AuthError("not_found", "No matching outstanding invoices found.");
    }

    const byClient = new Map<string, typeof rows>();
    for (const row of rows) {
      const key = row.clientId ?? `anon:${row.invoiceId}`;
      const list = byClient.get(key) ?? [];
      list.push(row);
      byClient.set(key, list);
    }

    const drafts: Array<{
      clientId: string | null;
      clientName: string;
      invoiceIds: string[];
      to: string | null;
      subject: string;
      message: string;
    }> = [];

    for (const [, clientRows] of byClient) {
      const first = clientRows[0]!;
      const draft = draftInvoiceReminderMessage({
        firmName: session.firm.name,
        clientName: first.clientName,
        rows: clientRows,
      });
      let to: string | null = null;
      if (first.clientId) {
        try {
          const recipient = await resolveDocumentRecipient(
            firmId,
            "invoice",
            first.invoiceId,
          );
          to = recipient.clientEmail;
        } catch {
          to = null;
        }
      }
      drafts.push({
        clientId: first.clientId,
        clientName: first.clientName,
        invoiceIds: clientRows.map((r) => r.invoiceId),
        to,
        subject: draft.subject,
        message: draft.message,
      });
    }

    // Edited copy applies only when reminding a single client group.
    if (drafts.length === 1) {
      if (body.subject?.trim()) drafts[0]!.subject = body.subject.trim();
      if (body.message?.trim()) drafts[0]!.message = body.message.trim();
    }

    if (!body.send && !body.logOnly) {
      return jsonOk({ drafts, sent: [] }, { request });
    }

    const sent: Array<{
      clientId: string | null;
      invoiceIds: string[];
      to: string;
      ok: boolean;
      error?: string;
    }> = [];

    for (const draft of drafts) {
      const toRaw = body.to?.trim() || draft.to || "";
      if (body.send && !toRaw) {
        sent.push({
          clientId: draft.clientId,
          invoiceIds: draft.invoiceIds,
          to: "",
          ok: false,
          error: "No recipient email on the client profile.",
        });
        continue;
      }

      try {
        if (body.send) {
          const to = normalizeEmailAddress(toRaw);
          const attachments = [];
          for (const invoiceId of draft.invoiceIds.slice(0, 5)) {
            const recipient = await resolveDocumentRecipient(firmId, "invoice", invoiceId);
            const rendered = await renderExport("invoice", "pdf", {
              firmId,
              session,
              searchParams: new URLSearchParams({ id: invoiceId }),
            });
            attachments.push({
              filename: documentAttachmentFilename("invoice", recipient.documentNumber),
              content: rendered.bytes,
              contentType: "application/pdf",
            });
          }
          await sendFirmEmail(firmId, {
            to,
            subject: draft.subject,
            text: draft.message,
            attachments,
          });
        }

        if (draft.clientId) {
          await createDebtorCommunication(firmId, {
            clientId: draft.clientId,
            employeeUserId: session.id,
            channel: "email",
            outcomeNotes: body.send
              ? `Payment reminder emailed.\n\n${draft.message}`
              : `Payment reminder drafted (not emailed).\n\n${draft.message}`,
            invoiceId: draft.invoiceIds[0] ?? null,
            nextFollowUpAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          });
        }

        await writeAuditLog({
          action: body.send ? "debtors.reminder_send" : "debtors.reminder_log",
          firmId,
          userId: session.id,
          entityType: "client",
          entityId: draft.clientId,
          metadata: {
            invoiceIds: draft.invoiceIds,
            to: toRaw || null,
          },
          ipOrUserAgent: clientInfo(request),
        });

        sent.push({
          clientId: draft.clientId,
          invoiceIds: draft.invoiceIds,
          to: toRaw,
          ok: true,
        });
      } catch (err) {
        sent.push({
          clientId: draft.clientId,
          invoiceIds: draft.invoiceIds,
          to: toRaw,
          ok: false,
          error: err instanceof Error ? err.message : "Send failed.",
        });
      }
    }

    return jsonOk({ drafts, sent }, { request });
  } catch (err) {
    return jsonError(err, request);
  }
}
