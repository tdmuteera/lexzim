/**
 * POST { email? } — send a staff-notification test email to a user's
 * communication address (or the email provided in the body).
 */
import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { getFirmEmailConfigPublic } from "@/lib/email/config";
import { normalizeEmailAddress, sendFirmEmail } from "@/lib/email/mailer";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getPrimaryCommunicationEmail } from "@/lib/repos/staff-communication-emails";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";
import { and, eq } from "drizzle-orm";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("users.manage");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { email?: string };

    const db = getDb();
    const targetRows = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        isSystemUser: users.isSystemUser,
        isActive: users.isActive,
      })
      .from(users)
      .where(and(eq(users.id, id), eq(users.firmId, firmId)))
      .limit(1);
    const target = targetRows[0];
    if (!target || !target.isSystemUser) {
      throw new AuthError("not_found", "System user not found.");
    }
    if (!target.isActive) {
      throw new AuthError("validation", "That login is inactive.");
    }

    const pub = await getFirmEmailConfigPublic(firmId);
    if (!pub.configured) {
      throw new AuthError(
        "validation",
        pub.passwordSet && !pub.passwordReadable
          ? "Stored SMTP password could not be read. Re-enter the mailbox password in Settings → Email and save."
          : "Complete SMTP settings under Settings → Email before sending a test.",
      );
    }

    const toRaw =
      (typeof body.email === "string" && body.email.trim()
        ? body.email.trim()
        : null) ||
      (await getPrimaryCommunicationEmail(firmId, id)) ||
      target.email;
    if (!toRaw?.trim()) {
      throw new AuthError("validation", "No notification email available for this person.");
    }
    const to = normalizeEmailAddress(toRaw);
    const firmName = session.firm.name?.trim() || "your firm";
    const fromLabel = pub.fromName?.trim() || firmName;

    const subject = `${firmName}: staff notification test`;
    const text = [
      `This is a LexZim staff notification test for ${target.fullName}.`,
      ``,
      `Firm: ${firmName}`,
      `Sender display name: ${fromLabel}`,
      `Sent to: ${to}`,
      ``,
      `If you received this on your phone or inbox, this notification channel is working.`,
      `Task assignments, approvals, requisitions, and calendar notices use this same path.`,
    ].join("\n");
    const html = `
      <p>This is a LexZim staff notification test for <strong>${escapeHtml(target.fullName)}</strong>.</p>
      <p><strong>Firm:</strong> ${escapeHtml(firmName)}<br/>
      <strong>Sender display name:</strong> ${escapeHtml(fromLabel)}<br/>
      <strong>Sent to:</strong> ${escapeHtml(to)}</p>
      <p>If you received this on your phone or inbox, this notification channel is working.
      Task assignments, approvals, requisitions, and calendar notices use this same path.</p>
    `.trim();

    let result: Awaited<ReturnType<typeof sendFirmEmail>>;
    try {
      result = await sendFirmEmail(firmId, { to, subject, text, html });
    } catch (sendErr) {
      const safeError =
        sendErr instanceof AuthError
          ? sendErr.message
          : "Test send failed. Check SMTP settings and try again.";
      await writeAuditLog({
        action: "staff_notify.test_failed",
        firmId,
        userId: session.id,
        entityType: "user",
        entityId: id,
        metadata: { to, error: safeError.slice(0, 300) },
        ipOrUserAgent: clientInfo(request),
      }).catch(() => undefined);
      if (sendErr instanceof AuthError) throw sendErr;
      throw new AuthError("validation", safeError);
    }

    await writeAuditLog({
      action: "staff_notify.test_sent",
      firmId,
      userId: session.id,
      entityType: "user",
      entityId: id,
      metadata: {
        to,
        transport: result.transport,
        messageId: result.messageId,
        from: result.from,
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ sent: true, to, transport: result.transport, from: result.from });
  } catch (err) {
    return jsonError(err, request);
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
