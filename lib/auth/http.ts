import { AuthError } from "@/lib/auth/types";
import { AiBudgetExceededError } from "@/lib/ai/budget";
import type { AuthSessionUser } from "@/lib/auth/types";
import { logError } from "@/lib/ops/log";

export function clientInfo(request: Request): string {
  const ua = request.headers.get("user-agent") ?? "";
  const fwd = request.headers.get("x-forwarded-for") ?? "";
  return [fwd.split(",")[0]?.trim(), ua.slice(0, 180)].filter(Boolean).join(" | ");
}

export function jsonError(err: unknown, fallbackStatus = 500) {
  if (err instanceof AiBudgetExceededError) {
    return Response.json(
      {
        ok: false,
        error: {
          code: err.code,
          message: err.message,
          used: err.used,
          budget: err.budget,
        },
      },
      { status: err.httpStatus },
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
    return Response.json({ ok: false, error: { code: err.code, message: err.message } }, { status });
  }

  logError("http.jsonError", err);
  return Response.json(
    { ok: false, error: { code: "server_error", message: "Unexpected server error." } },
    { status: fallbackStatus },
  );
}

export function jsonOk(data: unknown, init?: ResponseInit) {
  return Response.json({ ok: true, data }, init);
}

export function serializeSession(user: AuthSessionUser) {
  return {
    ...user,
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
  };
}
