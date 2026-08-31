import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { writeAuditLog } from "@/lib/auth/audit";
import { getFirmEmailConfigPublic } from "@/lib/email/config";
import { normalizeEmailAddress, sendFirmEmail } from "@/lib/email/mailer";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

/** POST { to? } — send a test email to verify SMTP settings. */
export async function POST(request: Request) {
  try {
    const session = await requirePermission("settings.manage");
    const firmId = tenantFirmId(session);
    const body = (await request.json().catch(() => ({}))) as { to?: string };

    const pub = await getFirmEmailConfigPublic(firmId);
    if (!pub.configured) {
      throw new AuthError(
        "validation",
        pub.passwordSet && !pub.passwordReadable
          ? "Stored SMTP password could not be read. Re-enter the mailbox password and save."
          : "Complete SMTP settings (host, from email, password) and save before testing.",
      );
    }

    const toRaw = body.to?.trim() || pub.fromEmail || session.email;
    if (!toRaw) throw new AuthError("validation", "No recipient available for the test.");
    const to = normalizeEmailAddress(toRaw);

    let result: Awaited<ReturnType<typeof sendFirmEmail>>;
    try {
      result = await sendFirmEmail(firmId, {
        to,
        subject: `LexZim test email — ${session.firm.name}`,
        text: `This is a test email from LexZim for ${session.firm.name}. If you received this, outbound email is working.`,
        html: `<p>This is a test email from <strong>LexZim</strong> for ${session.firm.name}.</p><p>If you received this, outbound email is working.</p>`,
      });
    } catch (sendErr) {
      const safeError =
        sendErr instanceof AuthError
          ? sendErr.message
          : "Test send failed. Check SMTP settings and try again.";
      try {
        await writeAuditLog({
          action: "email.failed",
          firmId,
          userId: session.id,
          entityType: "email",
          entityId: "test",
          metadata: { to, status: "failed", error: safeError },
          ipOrUserAgent: clientInfo(request),
        });
      } catch {
        /* audit must not block client error */
      }
      if (sendErr instanceof AuthError) throw sendErr;
      throw new AuthError("validation", safeError);
    }

    await writeAuditLog({
      action: "email.test_sent",
      firmId,
      userId: session.id,
      entityType: "email",
      entityId: "test",
      metadata: { to, transport: result.transport, messageId: result.messageId },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ sent: true, to, transport: result.transport });
  } catch (err) {
    return jsonError(err, request);
  }
}
