/**
 * Optional admin API: set another user's communication emails (users.manage).
 * Supports up to 3 notification addresses (business + personal + backup).
 */
import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import {
  listNotifyEmailsForUser,
  MAX_STAFF_NOTIFY_EMAILS,
  setCommunicationEmails,
} from "@/lib/repos/staff-communication-emails";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("users.manage");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const emails = await listNotifyEmailsForUser(firmId, id);
    return jsonOk({
      userId: id,
      communicationEmail: emails[0] ?? null,
      communicationEmails: emails,
      maxEmails: MAX_STAFF_NOTIFY_EMAILS,
    });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("users.manage");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const body = (await request.json()) as {
      email?: string;
      emails?: unknown;
    };

    let emails: string[] = [];
    if (Array.isArray(body.emails)) {
      emails = body.emails.filter(
        (e): e is string => typeof e === "string" && e.trim().length > 0,
      );
    } else if (typeof body.email === "string" && body.email.trim()) {
      emails = [body.email.trim()];
    }

    if (emails.length === 0) {
      throw new AuthError(
        "validation",
        "Provide email or emails (1 to 3 notification addresses).",
      );
    }
    if (emails.length > MAX_STAFF_NOTIFY_EMAILS) {
      throw new AuthError(
        "validation",
        `You can assign at most ${MAX_STAFF_NOTIFY_EMAILS} notification emails per person.`,
      );
    }

    const saved = await setCommunicationEmails(firmId, id, emails);

    await writeAuditLog({
      action: "staff_communication_emails.set",
      firmId,
      userId: session.id,
      entityType: "user",
      entityId: id,
      metadata: {
        emails: saved.emails,
        primary: saved.primary,
        count: saved.emails.length,
      },
      ipOrUserAgent: clientInfo(request),
    });
    return jsonOk({
      userId: id,
      communicationEmail: saved.primary,
      communicationEmails: saved.emails,
      maxEmails: MAX_STAFF_NOTIFY_EMAILS,
    });
  } catch (err) {
    return jsonError(err, request);
  }
}
