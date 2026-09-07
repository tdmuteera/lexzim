/**
 * Optional admin API: set another user's communication email (users.manage).
 */
import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import {
  getPrimaryCommunicationEmail,
  setPrimaryCommunicationEmail,
} from "@/lib/repos/staff-communication-emails";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("users.manage");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const email = await getPrimaryCommunicationEmail(firmId, id);
    return jsonOk({ userId: id, communicationEmail: email });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("users.manage");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const body = (await request.json()) as { email?: string };
    if (typeof body.email !== "string" || !body.email.trim()) {
      throw new AuthError("validation", "email is required.");
    }
    const row = await setPrimaryCommunicationEmail(firmId, id, body.email);
    await writeAuditLog({
      action: "staff_communication_emails.set",
      firmId,
      userId: session.id,
      entityType: "user",
      entityId: id,
      metadata: { email: row.email },
      ipOrUserAgent: clientInfo(request),
    });
    return jsonOk({ userId: id, communicationEmail: row.email });
  } catch (err) {
    return jsonError(err, request);
  }
}
