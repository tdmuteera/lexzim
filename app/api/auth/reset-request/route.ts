import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { writeAuditLog } from "@/lib/auth/audit";
import { createPasswordResetRequest } from "@/lib/repos/security";

/**
 * Public endpoint: a user requests a password reset from the login screen.
 * There is NO self-service email reset link — a Managing Partner / users.manage
 * admin must approve and issue a temp password. Always returns a generic OK to
 * avoid revealing whether an email exists.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { email?: string };
    const email = typeof body.email === "string" ? body.email : "";

    if (email.trim()) {
      await createPasswordResetRequest(email, {
        ipOrUserAgent: clientInfo(request),
      });
      await writeAuditLog({
        action: "auth.reset_requested",
        metadata: { email: email.trim().toLowerCase() },
        ipOrUserAgent: clientInfo(request),
      }).catch(() => undefined);
    }

    return jsonOk({
      submitted: true,
      message:
        "If that account exists, a reset request has been sent to your firm administrator for approval.",
    });
  } catch (err) {
    return jsonError(err, request);
  }
}
