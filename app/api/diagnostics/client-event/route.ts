import { jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { authCurrentUser } from "@/lib/auth/session";
import { recordEvent } from "@/lib/diagnostics/events";
import { moduleFromPath } from "@/lib/diagnostics/registry.overlay";
import {
  isSaneRequestId,
  mintRequestId,
  requestIdFromRequest,
} from "@/lib/diagnostics/request-id";
import {
  redactDiagnosticMessage,
  sanitizeRoutePath,
} from "@/lib/diagnostics/redact";
import { logWarn } from "@/lib/ops/log";
import { checkRateLimit, clientIpFromRequest } from "@/lib/ops/rate-limit";
import { requireOpsAccess } from "@/lib/platform/ops-guard";

/** Staff / ops browser events: 30 / actor / minute. */
const LIMIT = 30;
const WINDOW_MS = 60_000;

const FORBIDDEN_BODY_KEY =
  /password|secret|token|authorization|cookie|form|body|stack|kyc|amount|jwt/i;

type ClientEventBody = {
  requestId?: unknown;
  message?: unknown;
  level?: unknown;
  errorCode?: unknown;
  module?: unknown;
  pagePath?: unknown;
  digest?: unknown;
};

async function requireStaffOrOps(request: Request): Promise<{
  userId: string | null;
  firmId: string | null;
  role: string | null;
}> {
  const session = await authCurrentUser();
  if (session) {
    return {
      userId: session.id,
      firmId: session.firm.id,
      role: String(session.role.code),
    };
  }
  try {
    const admin = await requireOpsAccess(request);
    return {
      userId: admin.id,
      firmId: null,
      role: "platform_admin",
    };
  } catch {
    throw new AuthError("unauthorized", "Sign in required.");
  }
}

function assertRateLimit(request: Request, actorKey: string) {
  const ip = clientIpFromRequest(request);
  const result = checkRateLimit(
    `diagnostics-client:${actorKey}:${ip}`,
    LIMIT,
    WINDOW_MS,
  );
  if (!result.allowed) {
    logWarn("diagnostics.client-event", "rate_limited", {
      actorKey,
      retryAfterSec: result.retryAfterSec,
    });
    throw new AuthError(
      "rate_limited",
      `Too many diagnostic reports. Try again in about ${result.retryAfterSec} seconds.`,
    );
  }
}

/**
 * POST /api/diagnostics/client-event
 * Authenticated staff or ops. Persists source=frontend only.
 * Never accepts cookies, tokens, or form bodies from the payload.
 */
export async function POST(request: Request) {
  try {
    const actor = await requireStaffOrOps(request);
    assertRateLimit(request, actor.userId ?? "ops");

    let raw: ClientEventBody;
    try {
      raw = (await request.json()) as ClientEventBody;
    } catch {
      throw new AuthError("validation", "Invalid JSON body.");
    }

    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new AuthError("validation", "Invalid payload.");
    }

    for (const key of Object.keys(raw)) {
      if (FORBIDDEN_BODY_KEY.test(key)) {
        throw new AuthError("validation", "Forbidden diagnostic field.");
      }
    }

    const incoming =
      typeof raw.requestId === "string" ? raw.requestId.trim() : "";
    const requestId = isSaneRequestId(incoming)
      ? incoming
      : requestIdFromRequest(request) || mintRequestId();

    const messageSafe = redactDiagnosticMessage(
      typeof raw.message === "string" ? raw.message : "Browser error",
    );
    if (!messageSafe) {
      throw new AuthError("validation", "message is required.");
    }

    const levelRaw = typeof raw.level === "string" ? raw.level : "error";
    const level =
      levelRaw === "warn" || levelRaw === "info" || levelRaw === "error"
        ? levelRaw
        : "error";

    const pagePath = sanitizeRoutePath(
      typeof raw.pagePath === "string" ? raw.pagePath : null,
    );
    const moduleCode =
      (typeof raw.module === "string" && raw.module.trim().slice(0, 64)) ||
      (pagePath ? moduleFromPath(pagePath) : undefined) ||
      "platform";

    const errorCode =
      typeof raw.errorCode === "string"
        ? raw.errorCode.trim().slice(0, 64) || "frontend.error"
        : "frontend.error";

    const digest =
      typeof raw.digest === "string" ? raw.digest.trim().slice(0, 128) : "";

    await recordEvent({
      requestId,
      source: "frontend",
      level,
      module: moduleCode,
      route: pagePath,
      httpMethod: "POST",
      httpStatus: null,
      errorCode,
      messageSafe,
      userId: actor.userId,
      firmId: actor.firmId,
      role: actor.role,
      payload: {
        source: "client-event",
        pagePath: pagePath ?? undefined,
        ...(digest ? { digest } : {}),
      },
    });

    return jsonOk(
      { recorded: true, requestId },
      { request, requestId, module: moduleCode },
    );
  } catch (err) {
    return jsonError(err, request);
  }
}
