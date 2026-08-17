import { AuthError } from "@/lib/auth/types";
import { AiBudgetExceededError } from "@/lib/ai/budget";
import type { AuthSessionUser } from "@/lib/auth/types";
import { DatabaseUnavailableError } from "@/lib/db/connectivity";
import { recordEvent } from "@/lib/diagnostics/events";
import {
  applyRequestIdHeader,
  inferModuleFromRequest,
  isSaneRequestId,
  requestIdFromRequest,
} from "@/lib/diagnostics/request-id";
import { extractSqlState, redactDiagnosticMessage } from "@/lib/diagnostics/redact";
import { logError } from "@/lib/ops/log";

export type JsonHttpOptions = {
  request?: Request;
  requestId?: string;
  module?: string;
  fallbackStatus?: number;
};

export type JsonOkInit = ResponseInit & {
  request?: Request;
  requestId?: string;
  module?: string;
};

function resolveJsonOptions(
  second?: Request | JsonHttpOptions | null,
): JsonHttpOptions {
  if (!second) return {};
  if (typeof Request !== "undefined" && second instanceof Request) {
    return { request: second };
  }
  return second as JsonHttpOptions;
}

function resolveEnvelopeIds(options: JsonHttpOptions): {
  requestId: string;
  module?: string;
} {
  const fromExplicit = options.requestId?.trim();
  const requestId = isSaneRequestId(fromExplicit)
    ? fromExplicit
    : requestIdFromRequest(options.request ?? null);
  const moduleCode =
    options.module ?? inferModuleFromRequest(options.request ?? null);
  return { requestId, module: moduleCode };
}

function routeFromRequest(request?: Request | null): string | null {
  if (!request) return null;
  try {
    return new URL(request.url).pathname;
  } catch {
    return null;
  }
}

function scheduleErrorEvent(input: {
  requestId: string;
  module?: string;
  request?: Request | null;
  httpStatus: number;
  errorCode: string;
  messageSafe: string;
  err?: unknown;
  level: "info" | "warn" | "error";
}) {
  void recordEvent({
    requestId: input.requestId,
    source: "api",
    level: input.level,
    module: input.module || "platform",
    route: routeFromRequest(input.request),
    httpMethod: input.request?.method ?? null,
    httpStatus: input.httpStatus,
    errorCode: input.errorCode,
    sqlstate: extractSqlState(input.err),
    messageSafe: redactDiagnosticMessage(input.messageSafe),
    payload: {
      name: input.err instanceof Error ? input.err.name : undefined,
    },
  });
}

export function clientInfo(request: Request): string {
  const ua = request.headers.get("user-agent") ?? "";
  const fwd = request.headers.get("x-forwarded-for") ?? "";
  return [fwd.split(",")[0]?.trim(), ua.slice(0, 180)].filter(Boolean).join(" | ");
}

/**
 * Structured API error. Safe message only. Always includes requestId.
 * Pass the Request so the body matches middleware X-Request-Id (P8-03/P8-04).
 */
export function jsonError(err: unknown, requestOrOptions?: Request | JsonHttpOptions) {
  const options = resolveJsonOptions(requestOrOptions);
  const { requestId, module: moduleCode } = resolveEnvelopeIds(options);
  const fallbackStatus = options.fallbackStatus ?? 500;
  const request = options.request ?? null;

  if (err instanceof AiBudgetExceededError) {
    scheduleErrorEvent({
      requestId,
      module: moduleCode,
      request,
      httpStatus: err.httpStatus,
      errorCode: err.code,
      messageSafe: err.message,
      err,
      level: "warn",
    });
    return applyRequestIdHeader(
      Response.json(
        {
          ok: false,
          requestId,
          error: {
            code: err.code,
            message: err.message,
            requestId,
            ...(moduleCode ? { module: moduleCode } : {}),
            used: err.used,
            budget: err.budget,
          },
        },
        { status: err.httpStatus },
      ),
      requestId,
    );
  }

  if (err instanceof DatabaseUnavailableError) {
    scheduleErrorEvent({
      requestId,
      module: moduleCode,
      request,
      httpStatus: 503,
      errorCode: err.code,
      messageSafe: err.message,
      err,
      level: "error",
    });
    return applyRequestIdHeader(
      Response.json(
        {
          ok: false,
          requestId,
          error: {
            code: err.code,
            message:
              "Cannot reach the database right now. Wait a moment and try again, or open /login?db_retry=1.",
            requestId,
            ...(moduleCode ? { module: moduleCode } : {}),
          },
        },
        { status: 503 },
      ),
      requestId,
    );
  }

  if (err instanceof AuthError) {
    const status =
      err.code === "unauthorized"
        ? 401
        : err.code === "forbidden"
          ? 403
          : err.code === "not_found"
            ? 404
            : err.code === "licence_expired" ||
                err.code === "feature_disabled" ||
                err.code === "seat_limit" ||
                err.code === "matter_limit"
              ? 403
            : err.code === "proxy_quota" || err.code === "rate_limited"
              ? 429
            : err.code === "setup_complete"
              ? 409
              : err.code === "invalid_credentials" ||
                  err.code === "weak_password" ||
                  err.code === "invalid_email" ||
                  err.code === "validation"
                ? 400
                : 400;

    const level: "info" | "warn" | "error" =
      status >= 500 ? "error" : status === 401 || status === 403 ? "warn" : "info";

    scheduleErrorEvent({
      requestId,
      module: moduleCode,
      request,
      httpStatus: status,
      errorCode: err.code,
      messageSafe: err.message,
      err,
      level,
    });

    return applyRequestIdHeader(
      Response.json(
        {
          ok: false,
          requestId,
          error: {
            code: err.code,
            message: err.message,
            requestId,
            ...(moduleCode ? { module: moduleCode } : {}),
          },
        },
        { status },
      ),
      requestId,
    );
  }

  logError("http.jsonError", err, { requestId, module: moduleCode });
  scheduleErrorEvent({
    requestId,
    module: moduleCode,
    request,
    httpStatus: fallbackStatus,
    errorCode: "server_error",
    messageSafe: err instanceof Error ? err.message : "Unexpected server error.",
    err,
    level: "error",
  });
  return applyRequestIdHeader(
    Response.json(
      {
        ok: false,
        requestId,
        error: {
          code: "server_error",
          message: "Unexpected server error.",
          requestId,
          ...(moduleCode ? { module: moduleCode } : {}),
        },
      },
      { status: fallbackStatus },
    ),
    requestId,
  );
}

export function jsonOk(data: unknown, init?: JsonOkInit) {
  const { request, requestId: explicitId, module: explicitModule, ...responseInit } =
    init ?? {};
  const { requestId, module: moduleCode } = resolveEnvelopeIds({
    request,
    requestId: explicitId,
    module: explicitModule,
  });

  return applyRequestIdHeader(
    Response.json(
      {
        ok: true,
        requestId,
        ...(moduleCode ? { module: moduleCode } : {}),
        data,
      },
      responseInit,
    ),
    requestId,
  );
}

export function serializeSession(user: AuthSessionUser) {
  return {
    ...user,
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
  };
}
