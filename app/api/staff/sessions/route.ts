import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import {
  decodeAccessTokenClaims,
  listActiveStaffSessions,
  revokeAllStaffSessionsForUser,
  revokeStaffSession,
  setUserActiveState,
} from "@/lib/auth/staff-sessions";
import { assertSeatAvailable, getLicenceUsage } from "@/lib/licensing/policy";
import { requirePermission } from "@/lib/rbac/guards";
import { createClient } from "@/lib/supabase/server";
import { tenantFirmId } from "@/lib/tenant/scope";

/** List active web sessions for the firm (optional ?userId=). */
export async function GET(request: Request) {
  try {
    const session = await requirePermission("users.manage");
    const firmId = tenantFirmId(session);
    const userId = new URL(request.url).searchParams.get("userId")?.trim() || undefined;
    const rows = await listActiveStaffSessions(firmId, userId);
    return jsonOk({
      items: rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        sessionId: r.sessionId,
        fullName: r.fullName,
        email: r.email,
        ipOrUserAgent: r.ipOrUserAgent,
        createdAt: r.createdAt.toISOString(),
        lastSeenAt: r.lastSeenAt.toISOString(),
        isCurrent: false,
      })),
      note: "Sessions appear after login (web). Revoke ends the registry entry and best-effort clears Supabase auth.sessions.",
    });
  } catch (err) {
    return jsonError(err);
  }
}

/**
 * Admin actions:
 * - { action: "revoke", registryId }
 * - { action: "revoke_all", userId, keepCurrent?: boolean }
 * - { action: "deactivate"|"reactivate", userId }
 */
export async function POST(request: Request) {
  try {
    const session = await requirePermission("users.manage");
    const firmId = tenantFirmId(session);
    const body = (await request.json()) as {
      action?: string;
      registryId?: string;
      userId?: string;
      keepCurrent?: boolean;
    };
    const info = clientInfo(request);

    if (body.action === "revoke") {
      if (!body.registryId?.trim()) {
        throw new AuthError("validation", "registryId is required.");
      }
      const row = await revokeStaffSession({
        firmId,
        registryId: body.registryId.trim(),
        revokedByUserId: session.id,
      });
      await writeAuditLog({
        action: "users.session_revoke",
        firmId,
        userId: session.id,
        entityType: "staff_session",
        entityId: row.id,
        metadata: { targetUserId: row.userId, sessionId: row.sessionId },
        ipOrUserAgent: info,
      });
      return jsonOk({ revoked: true, id: row.id });
    }

    if (body.action === "revoke_all") {
      if (!body.userId?.trim()) {
        throw new AuthError("validation", "userId is required.");
      }
      let exceptSessionId: string | null = null;
      if (body.keepCurrent && body.userId === session.id) {
        const supabase = await createClient();
        const {
          data: { session: sb },
        } = await supabase.auth.getSession();
        exceptSessionId = sb?.access_token
          ? decodeAccessTokenClaims(sb.access_token).sessionId
          : null;
      }
      const rows = await revokeAllStaffSessionsForUser({
        firmId,
        userId: body.userId.trim(),
        revokedByUserId: session.id,
        exceptSessionId,
      });
      await writeAuditLog({
        action: "users.session_revoke_all",
        firmId,
        userId: session.id,
        entityType: "user",
        entityId: body.userId.trim(),
        metadata: { count: rows.length, keepCurrent: Boolean(body.keepCurrent) },
        ipOrUserAgent: info,
      });
      return jsonOk({ revokedCount: rows.length });
    }

    if (body.action === "deactivate" || body.action === "reactivate") {
      if (!body.userId?.trim()) {
        throw new AuthError("validation", "userId is required.");
      }
      const targetId = body.userId.trim();
      if (targetId === session.id) {
        throw new AuthError("validation", "You cannot deactivate your own account.");
      }
      const isActive = body.action === "reactivate";
      if (isActive) {
        await assertSeatAvailable(firmId);
      }
      const user = await setUserActiveState({
        firmId,
        userId: targetId,
        isActive,
      });
      if (!isActive) {
        await revokeAllStaffSessionsForUser({
          firmId,
          userId: targetId,
          revokedByUserId: session.id,
        });
      }
      await writeAuditLog({
        action: isActive ? "users.reactivate" : "users.deactivate",
        firmId,
        userId: session.id,
        entityType: "user",
        entityId: targetId,
        metadata: { email: user.email, isActive },
        ipOrUserAgent: info,
      });
      const usage = await getLicenceUsage(firmId);
      return jsonOk({
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          isActive: user.isActive,
        },
        seats: {
          limit: usage.seats,
          used: usage.seatsUsed,
          remaining: usage.seatsRemaining,
        },
      });
    }

    throw new AuthError(
      "validation",
      'action must be revoke, revoke_all, deactivate, or reactivate.',
    );
  } catch (err) {
    return jsonError(err);
  }
}
