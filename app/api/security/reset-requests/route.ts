import { eq } from "drizzle-orm";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { writeAuditLog } from "@/lib/auth/audit";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import {
  getResetRequest,
  listResetRequests,
  markResetResolved,
} from "@/lib/repos/security";
import { generateTempPassword } from "@/lib/auth/temp-password";
import { requirePermission } from "@/lib/rbac/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { tenantFirmId } from "@/lib/tenant/scope";

/** GET pending (or all) password reset requests for the firm. */
export async function GET(request: Request) {
  try {
    const session = await requirePermission("users.manage");
    const firmId = tenantFirmId(session);
    const url = new URL(request.url);
    const status = url.searchParams.get("status") === "all" ? "all" : "pending";
    const items = await listResetRequests(firmId, status);
    return jsonOk({ items });
  } catch (err) {
    return jsonError(err);
  }
}

/**
 * POST { requestId, action: "approve"|"reject", note? }
 * Approve → issue a new temp password (returned ONCE), force change on next
 * login, and audit. Reject → close the request without issuing a password.
 */
export async function POST(request: Request) {
  try {
    const session = await requirePermission("users.manage");
    const firmId = tenantFirmId(session);
    const body = (await request.json()) as {
      requestId?: string;
      action?: string;
      note?: string;
    };

    const requestId = body.requestId?.trim();
    if (!requestId) throw new AuthError("validation", "requestId is required.");
    const action = body.action?.trim();
    if (action !== "approve" && action !== "reject") {
      throw new AuthError("validation", "action must be approve or reject.");
    }

    const reqRow = await getResetRequest(firmId, requestId);
    if (!reqRow) throw new AuthError("not_found", "Reset request not found.");
    if (reqRow.status !== "pending") {
      throw new AuthError("validation", "This request has already been resolved.");
    }

    if (action === "reject") {
      await markResetResolved(requestId, "rejected", session.id, body.note ?? null);
      await writeAuditLog({
        action: "security.password_reset_rejected",
        firmId,
        userId: session.id,
        entityType: "user",
        entityId: reqRow.userId,
        metadata: { requestId, email: reqRow.email },
        ipOrUserAgent: clientInfo(request),
      });
      return jsonOk({ resolved: true, action: "reject" });
    }

    // approve
    if (!reqRow.userId) {
      throw new AuthError(
        "validation",
        "This request is not linked to an active user and cannot be approved. Reject it instead.",
      );
    }

    const tempPassword = generateTempPassword();
    const admin = createAdminClient();
    const { error: updErr } = await admin.auth.admin.updateUserById(reqRow.userId, {
      password: tempPassword,
    });
    if (updErr) {
      throw new AuthError("validation", "Could not set the temporary password.");
    }

    const db = getDb();
    await db
      .update(users)
      .set({ mustChangePassword: true, updatedAt: new Date() })
      .where(eq(users.id, reqRow.userId));

    await markResetResolved(requestId, "approved", session.id, body.note ?? null);

    await writeAuditLog({
      action: "security.password_reset_approved",
      firmId,
      userId: session.id,
      entityType: "user",
      entityId: reqRow.userId,
      metadata: { requestId, email: reqRow.email },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({
      resolved: true,
      action: "approve",
      email: reqRow.email,
      tempPassword,
    });
  } catch (err) {
    return jsonError(err);
  }
}
