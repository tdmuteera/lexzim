import { AuthError } from "@/lib/auth/types";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import {
  portalCurrentUser,
  portalLoginWithMagicToken,
  portalLoginWithPassword,
  portalLogout,
  requestPortalMagicLink,
  serializePortalSession,
} from "@/lib/portal/auth";
import { isPortalEnabled } from "@/lib/portal/config";
import { logWarn } from "@/lib/ops/log";
import { checkRateLimit, clientIpFromRequest } from "@/lib/ops/rate-limit";

/** Portal auth POST: 20 attempts / IP / 15 minutes (single replica). */
const PORTAL_AUTH_LIMIT = 20;
const PORTAL_AUTH_WINDOW_MS = 15 * 60 * 1000;

function assertPortalAuthRateLimit(request: Request) {
  const ip = clientIpFromRequest(request);
  const result = checkRateLimit(
    `portal-auth:${ip}`,
    PORTAL_AUTH_LIMIT,
    PORTAL_AUTH_WINDOW_MS,
  );
  if (!result.allowed) {
    logWarn("portal.auth", "rate_limited", { ip, retryAfterSec: result.retryAfterSec });
    throw new AuthError(
      "rate_limited",
      `Too many sign-in attempts. Try again in about ${result.retryAfterSec} seconds.`,
    );
  }
}

export async function GET() {
  try {
    if (!isPortalEnabled()) {
      return jsonOk({ user: null, portalEnabled: false });
    }
    const user = await portalCurrentUser();
    return jsonOk({
      portalEnabled: true,
      user: user ? serializePortalSession(user) : null,
    });
  } catch (err) {
    return jsonError(err);
  }
}

/**
 * Body:
 * - { email, password, firmSlug? } password login
 * - { email, magicLink: true, firmSlug? } request magic link
 * - { token } consume magic link
 * - { logout: true } sign out
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
      firmSlug?: string;
      magicLink?: boolean;
      token?: string;
      logout?: boolean;
    };
    const info = clientInfo(request);

    if (body.logout) {
      await portalLogout({ ipOrUserAgent: info });
      return jsonOk({ signedOut: true });
    }

    assertPortalAuthRateLimit(request);

    if (typeof body.token === "string" && body.token.trim()) {
      const user = await portalLoginWithMagicToken(body.token, {
        ipOrUserAgent: info,
      });
      return jsonOk({ user: serializePortalSession(user) });
    }

    if (body.magicLink) {
      const result = await requestPortalMagicLink(body.email ?? "", {
        ipOrUserAgent: info,
        firmSlug: body.firmSlug,
      });
      return jsonOk({
        magicLinkSent: result.sent,
        magicLinkUrl: result.magicLinkUrl,
        note: result.magicLinkUrl
          ? "Dev/ops: magic link returned in response. Production email delivery is not wired yet."
          : "If an account exists, a sign-in link was created. Email delivery is not wired in MVP; ask your firm for the link or use a password.",
      });
    }

    const user = await portalLoginWithPassword(body.email ?? "", body.password ?? "", {
      ipOrUserAgent: info,
      firmSlug: body.firmSlug,
    });
    return jsonOk({ user: serializePortalSession(user) });
  } catch (err) {
    return jsonError(err);
  }
}
