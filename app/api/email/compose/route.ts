import { and, eq } from "drizzle-orm";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { writeAuditLog } from "@/lib/auth/audit";
import { getDb } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import { clientDisplayLabel } from "@/lib/clients/display";
import { normalizeEmailAddress, sendFirmEmail } from "@/lib/email/mailer";
import { requireAny } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

/**
 * POST { clientId, subject, body, to? }
 * Generic notification email to a client. MP (users.manage) or accounts
 * (billing.manage) only. Defaults recipient to the client profile email.
 */
export async function POST(request: Request) {
  try {
    const session = await requireAny(["users.manage", "billing.manage"]);
    const firmId = tenantFirmId(session);
    const payload = (await request.json()) as {
      clientId?: string;
      subject?: string;
      body?: string;
      to?: string;
    };

    const clientId = payload.clientId?.trim();
    if (!clientId) throw new AuthError("validation", "clientId is required.");
    const subject = payload.subject?.trim();
    if (!subject) throw new AuthError("validation", "Subject is required.");
    const messageBody = payload.body?.trim();
    if (!messageBody) throw new AuthError("validation", "Message body is required.");

    const db = getDb();
    const rows = await db
      .select({
        id: clients.id,
        email: clients.email,
        clientNumber: clients.clientNumber,
        clientType: clients.clientType,
        firstName: clients.firstName,
        surname: clients.surname,
        fullName: clients.fullName,
        legalName: clients.legalName,
        registeredName: clients.registeredName,
        tradingName: clients.tradingName,
      })
      .from(clients)
      .where(and(eq(clients.firmId, firmId), eq(clients.id, clientId)))
      .limit(1);
    const client = rows[0];
    if (!client) throw new AuthError("not_found", "Client not found.");

    const toRaw = payload.to?.trim() || client.email?.trim() || "";
    if (!toRaw) {
      throw new AuthError(
        "validation",
        "This client has no email on file. Add one to the profile or enter a recipient.",
      );
    }
    const to = normalizeEmailAddress(toRaw);

    const label = clientDisplayLabel({
      clientNumber: client.clientNumber,
      clientType: client.clientType,
      firstName: client.firstName,
      surname: client.surname,
      fullName: client.fullName,
      legalName: client.legalName,
      registeredName: client.registeredName,
      tradingName: client.tradingName,
    });

    const result = await sendFirmEmail(firmId, {
      to,
      subject,
      text: `${messageBody}\n\nRegards,\n${session.firm.name}`,
      html: `${messageBody
        .split("\n")
        .map((line) => (line ? `<p>${line}</p>` : "<br/>"))
        .join("")}<p>Regards,<br/>${session.firm.name}</p>`,
    });

    await writeAuditLog({
      action: "email.sent",
      firmId,
      userId: session.id,
      entityType: "client",
      entityId: clientId,
      metadata: {
        recipient: to,
        templateType: "notification",
        clientLabel: label,
        subject,
        transport: result.transport,
        messageId: result.messageId,
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ sent: true, to });
  } catch (err) {
    return jsonError(err, request);
  }
}
