import { authLogin } from "@/lib/auth/service";
import { AuthError } from "@/lib/auth/types";
import { clientInfo, jsonError, jsonOk, serializeSession } from "@/lib/auth/http";
import { prepareDbRetry } from "@/lib/db";
import { logWarn } from "@/lib/ops/log";
import { checkRateLimit, clientIpFromRequest } from "@/lib/ops/rate-limit";

/** Staff login: 30 attempts / IP / 15 minutes (single replica). */
const STAFF_LOGIN_LIMIT = 30;
const STAFF_LOGIN_WINDOW_MS = 15 * 60 * 1000;

function assertStaffLoginRateLimit(request: Request) {
  const ip = clientIpFromRequest(request);
  const result = checkRateLimit(`staff-login:${ip}`, STAFF_LOGIN_LIMIT, STAFF_LOGIN_WINDOW_MS);
  if (!result.allowed) {
    logWarn("auth.login", "rate_limited", { ip, retryAfterSec: result.retryAfterSec });
    throw new AuthError(
      "rate_limited",
      `Too many sign-in attempts. Try again in about ${result.retryAfterSec} seconds.`,
    );
  }
}

export async function POST(request: Request) {
  try {
    prepareDbRetry();
    assertStaffLoginRateLimit(request);
    const body = (await request.json()) as { email?: string; password?: string };
    const user = await authLogin(body.email ?? "", body.password ?? "", {
      ipOrUserAgent: clientInfo(request),
    });
    return jsonOk({ user: serializeSession(user) }, { request });
  } catch (err) {
    return jsonError(err, request);
  }
}
