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
    const toRaw = body.to?.trim() || pub.fromEmail || session.email;
    if (!toRaw) throw new AuthError("validation", "No recipient available for the test.");
    const to = normalizeEmailAddress(toRaw);

    const result = await sendFirmEmail(firmId, {
      to,
      subject: `LexZim test email — ${session.firm.name}`,
      text: `This is a test email from LexZim for ${session.firm.name}. If you received this, outbound email is working.`,
      html: `<p>This is a test email from <strong>LexZim</strong> for ${session.firm.name}.</p><p>If you received this, outbound email is working.</p>`,
    });

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
    return jsonError(err);
  }
}
