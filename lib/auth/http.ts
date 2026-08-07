import { AuthError } from "@/lib/auth/types";
import type { AuthSessionUser } from "@/lib/auth/types";

export function clientInfo(request: Request): string {
  const ua = request.headers.get("user-agent") ?? "";
  const fwd = request.headers.get("x-forwarded-for") ?? "";
  return [fwd.split(",")[0]?.trim(), ua.slice(0, 180)].filter(Boolean).join(" | ");
}

export function jsonError(err: unknown, fallbackStatus = 500) {
  if (err instanceof AuthError) {
    const status =
      err.code === "unauthorized"
        ? 401
        : err.code === "forbidden"
          ? 403
          : err.code === "not_found"
            ? 404
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

  console.error(err);
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
