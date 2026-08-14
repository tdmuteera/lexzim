import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { writeAuditLog } from "@/lib/auth/audit";
import {
  isSendableDocumentKind,
  resolveDocumentRecipient,
} from "@/lib/email/document-send";
import { normalizeEmailAddress, sendFirmEmail } from "@/lib/email/mailer";
import { renderExport } from "@/lib/export/registry";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

/**
 * POST { kind: "quotation"|"invoice"|"receipt", id, to?, message? }
 * Emails the document as a PDF attachment. Defaults recipient to client email.
 */
export async function POST(request: Request) {
  try {
    const session = await requirePermission("billing.view");
    const firmId = tenantFirmId(session);
    const body = (await request.json()) as {
      kind?: string;
      id?: string;
      to?: string;
      message?: string;
    };

    const kind = body.kind?.trim() ?? "";
    if (!isSendableDocumentKind(kind)) {
      throw new AuthError("validation", "kind must be quotation, invoice, or receipt.");
    }
    const id = body.id?.trim();
    if (!id) throw new AuthError("validation", "Document id is required.");

    const recipient = await resolveDocumentRecipient(firmId, kind, id);
    const toRaw = body.to?.trim() || recipient.clientEmail || "";
    if (!toRaw) {
      throw new AuthError(
        "validation",
        "No recipient email. Add an email to the client profile or enter one.",
      );
    }
    const to = normalizeEmailAddress(toRaw);

    const rendered = await renderExport(kind, "pdf", {
      firmId,
      session,
      searchParams: new URLSearchParams({ id }),
    });

    const subject = `${recipient.documentLabel} — ${session.firm.name}`;
    const greeting = recipient.clientLabel && recipient.clientLabel !== "Client"
      ? `Dear ${recipient.clientLabel.split("·").pop()?.trim() ?? "Client"},`
      : "Hello,";
    const customMessage = body.message?.trim();
    const bodyText = [
      greeting,
      "",
      customMessage ||
        `Please find attached ${recipient.documentLabel} from ${session.firm.name}.`,
      "",
      `Regards,`,
      session.firm.name,
    ].join("\n");

    const result = await sendFirmEmail(firmId, {
      to,
      subject,
      text: bodyText,
      html: bodyText
        .split("\n")
        .map((line) => (line ? `<p>${line}</p>` : "<br/>"))
        .join(""),
      attachments: [
        {
          filename: `${rendered.filenameBase}-${recipient.documentNumber}.pdf`,
          content: rendered.bytes,
          contentType: "application/pdf",
        },
      ],
    });

    await writeAuditLog({
      action: "email.sent",
      firmId,
      userId: session.id,
      entityType: kind,
      entityId: id,
      metadata: {
        recipient: to,
        templateType: kind,
        clientId: recipient.clientId,
        documentNumber: recipient.documentNumber,
        transport: result.transport,
        messageId: result.messageId,
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ sent: true, to, document: recipient.documentLabel });
  } catch (err) {
    return jsonError(err);
  }
}
