/**
 * POST { email? | emails? } — send a staff-notification test email to one or
 * more communication addresses for a user (users.manage).
 */
import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { getFirmEmailConfigPublic } from "@/lib/email/config";
import { normalizeEmailAddress, sendFirmEmail } from "@/lib/email/mailer";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import {
  listNotifyEmailsForUser,
  MAX_STAFF_NOTIFY_EMAILS,
} from "@/lib/repos/staff-communication-emails";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";
import { and, eq } from "drizzle-orm";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("users.manage");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      email?: string;
      emails?: unknown;
    };

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

    const fromBody: string[] = [];
    if (Array.isArray(body.emails)) {
      for (const raw of body.emails) {
        if (typeof raw === "string" && raw.trim()) fromBody.push(raw.trim());
      }
    } else if (typeof body.email === "string" && body.email.trim()) {
      fromBody.push(body.email.trim());
    }

    let recipients: string[] = [];
    const seen = new Set<string>();
    const source =
      fromBody.length > 0
        ? fromBody
        : await listNotifyEmailsForUser(firmId, id);

    for (const raw of source) {
      try {
        const email = normalizeEmailAddress(raw);
        if (seen.has(email)) continue;
        seen.add(email);
        recipients.push(email);
        if (recipients.length >= MAX_STAFF_NOTIFY_EMAILS) break;
      } catch {
        throw new AuthError("validation", `Invalid email address: ${raw.trim()}`);
      }
    }

    if (recipients.length === 0 && target.email?.trim()) {
      recipients = [normalizeEmailAddress(target.email)];
    }
    if (recipients.length === 0) {
      throw new AuthError("validation", "No notification email available for this person.");
    }

    const firmName = session.firm.name?.trim() || "your firm";
    const fromLabel = pub.fromName?.trim() || firmName;
    const subject = `${firmName}: staff notification test`;

    const sent: Array<{ to: string; messageId?: string; transport?: string; from?: string }> =
      [];
    const failed: Array<{ to: string; error: string }> = [];

    for (const to of recipients) {
      const text = [
        `This is a LexZim staff notification test for ${target.fullName}.`,
        ``,
        `Firm: ${firmName}`,
        `Sender display name: ${fromLabel}`,
        `Sent to: ${to}`,
        recipients.length > 1
          ? `This person has ${recipients.length} notification addresses; each gets the same staff notices.`
          : null,
        ``,
        `If you received this on your phone or inbox, this notification channel is working.`,
        `Task assignments, approvals, requisitions, and calendar notices use this same path.`,
      ]
        .filter(Boolean)
        .join("\n");
      const html = `
      <p>This is a LexZim staff notification test for <strong>${escapeHtml(target.fullName)}</strong>.</p>
      <p><strong>Firm:</strong> ${escapeHtml(firmName)}<br/>
      <strong>Sender display name:</strong> ${escapeHtml(fromLabel)}<br/>
      <strong>Sent to:</strong> ${escapeHtml(to)}</p>
      ${
        recipients.length > 1
          ? `<p>This person has ${recipients.length} notification addresses; each gets the same staff notices.</p>`
          : ""
      }
      <p>If you received this on your phone or inbox, this notification channel is working.
      Task assignments, approvals, requisitions, and calendar notices use this same path.</p>
    `.trim();

      try {
        const result = await sendFirmEmail(firmId, { to, subject, text, html });
        sent.push({
          to,
          messageId: result.messageId ?? undefined,
          transport: result.transport,
          from: result.from ?? undefined,
        });
      } catch (sendErr) {
        const safeError =
          sendErr instanceof AuthError
            ? sendErr.message
            : "Test send failed. Check SMTP settings and try again.";
        failed.push({ to, error: safeError.slice(0, 300) });
        await writeAuditLog({
          action: "staff_notify.test_failed",
          firmId,
          userId: session.id,
          entityType: "user",
          entityId: id,
          metadata: { to, error: safeError.slice(0, 300) },
          ipOrUserAgent: clientInfo(request),
        }).catch(() => undefined);
      }
    }

    if (sent.length === 0) {
      throw new AuthError(
        "validation",
        failed[0]?.error ?? "Test send failed. Check SMTP settings and try again.",
      );
    }

    await writeAuditLog({
      action: "staff_notify.test_sent",
      firmId,
      userId: session.id,
      entityType: "user",
      entityId: id,
      metadata: {
        recipients: sent.map((s) => s.to),
        to: sent[0]!.to,
        transport: sent[0]!.transport,
        messageId: sent[0]!.messageId,
        from: sent[0]!.from,
        failedCount: failed.length,
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({
      sent: true,
      to: sent[0]!.to,
      recipients: sent.map((s) => s.to),
      transport: sent[0]!.transport,
      from: sent[0]!.from,
      failed: failed.length > 0 ? failed : undefined,
    });
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
