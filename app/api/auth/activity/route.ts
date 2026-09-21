import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import {
  STAFF_EXPIRED_LOGOUT_REASON,
  STAFF_IDLE_LOGOUT_REASON,
} from "@/lib/auth/idle-timeout";
import {
  decodeAccessTokenClaims,
  touchStaffSessionActivity,
} from "@/lib/auth/staff-sessions";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/auth/audit";

/**
 * Heartbeat from the open app tab so idle is measured from real activity,
 * not only from login time. Returns 401 when idle / absolute max is exceeded.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      throw new AuthError("unauthorized", "Sign in required.");
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const accessToken = session?.access_token ?? null;
    const { sessionId } = accessToken
      ? decodeAccessTokenClaims(accessToken)
      : { sessionId: null };

    const freshness = await touchStaffSessionActivity({
      userId: user.id,
      sessionId,
    });

    if (freshness !== "ok") {
      await supabase.auth.signOut();
      const reason =
        freshness === "idle" ? STAFF_IDLE_LOGOUT_REASON : STAFF_EXPIRED_LOGOUT_REASON;
      await writeAuditLog({
        action: freshness === "idle" ? "auth.idle_logout" : "auth.session_expired",
        userId: user.id,
        metadata: { reason, via: "activity_ping" },
        ipOrUserAgent: clientInfo(request),
      }).catch(() => undefined);
      throw new AuthError("unauthorized", "Sign in required.");
    }

    return jsonOk({ ok: true, touched: true });
  } catch (err) {
    return jsonError(err, request);
  }
}
