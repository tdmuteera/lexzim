import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { writeAuditLog } from "@/lib/auth/audit";
import {
  documentAttachmentFilename,
  isSendableDocumentKind,
  resolveDocumentRecipient,
} from "@/lib/email/document-send";
import { normalizeEmailAddress, sendFirmEmail } from "@/lib/email/mailer";
import { renderExport } from "@/lib/export/registry";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

const SUBJECT_MAX = 200;

/**
 * GET ?kind=quotation|invoice|receipt&id=
 * Preview metadata for the send modal (recipient, subject default, attachment name).
 */
export async function GET(request: Request) {
  try {
    const session = await requirePermission("billing.view");
    const firmId = tenantFirmId(session);
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind")?.trim() ?? "";
    if (!isSendableDocumentKind(kind)) {
      throw new AuthError("validation", "kind must be quotation, invoice, or receipt.");
    }
    const id = url.searchParams.get("id")?.trim();
    if (!id) throw new AuthError("validation", "Document id is required.");

    const recipient = await resolveDocumentRecipient(firmId, kind, id);
    const attachmentFilename = documentAttachmentFilename(kind, recipient.documentNumber);
    const subjectDefault = `${recipient.documentLabel} — ${session.firm.name}`;

    return jsonOk({
      kind,
      id,
      to: recipient.clientEmail,
      documentLabel: recipient.documentLabel,
      documentNumber: recipient.documentNumber,
      firmName: session.firm.name,
      attachmentFilename,
      subjectDefault,
    });
  } catch (err) {
    return jsonError(err, request);
  }
}

/**
 * POST { kind: "quotation"|"invoice"|"receipt", id, to?, subject?, message? }
 * Emails the document as a PDF attachment. Defaults recipient to client email.
 * Manual send only: no silent/cron client email.
 */
export async function POST(request: Request) {
  try {
    const session = await requirePermission("billing.view");
    const firmId = tenantFirmId(session);
    const body = (await request.json()) as {
      kind?: string;
      id?: string;
      to?: string;
      subject?: string;
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

    const defaultSubject = `${recipient.documentLabel} — ${session.firm.name}`;
    let subject = body.subject?.trim() || defaultSubject;
    if (subject.length > SUBJECT_MAX) {
      throw new AuthError(
        "validation",
        `Subject must be at most ${SUBJECT_MAX} characters.`,
      );
    }

    const rendered = await renderExport(kind, "pdf", {
      firmId,
      session,
      searchParams: new URLSearchParams({ id }),
    });

    const greeting =
      recipient.clientLabel && recipient.clientLabel !== "Client"
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

    const attachmentFilename = documentAttachmentFilename(kind, recipient.documentNumber);

    let result: Awaited<ReturnType<typeof sendFirmEmail>>;
    try {
      result = await sendFirmEmail(firmId, {
        to,
        subject,
        text: bodyText,
        html: bodyText
          .split("\n")
          .map((line) => (line ? `<p>${line}</p>` : "<br/>"))
          .join(""),
        attachments: [
          {
            filename: attachmentFilename,
            content: rendered.bytes,
            contentType: "application/pdf",
          },
        ],
      });
    } catch (sendErr) {
      const safeError =
        sendErr instanceof AuthError
          ? sendErr.message
          : "Could not send email. Check SMTP settings or try again.";
      try {
        await writeAuditLog({
          action: "email.failed",
          firmId,
          userId: session.id,
          entityType: kind,
          entityId: id,
          metadata: {
            recipient: to,
            subject,
            templateType: kind,
            documentNumber: recipient.documentNumber,
            status: "failed",
            error: safeError,
          },
          ipOrUserAgent: clientInfo(request),
        });
      } catch {
        /* audit must not block the client error envelope */
      }
      if (sendErr instanceof AuthError) throw sendErr;
      throw new AuthError("validation", safeError);
    }

    await writeAuditLog({
      action: "email.sent",
      firmId,
      userId: session.id,
      entityType: kind,
      entityId: id,
      metadata: {
        recipient: to,
        subject,
        templateType: kind,
        clientId: recipient.clientId,
        documentNumber: recipient.documentNumber,
        status: "sent",
        transport: result.transport,
        messageId: result.messageId,
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({
      sent: true,
      to,
      subject,
      document: recipient.documentLabel,
      attachmentFilename,
    });
  } catch (err) {
    return jsonError(err, request);
  }
}
