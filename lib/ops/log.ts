/**
 * Safe server logging for Railway (P4-08).
 * Never log API keys, JWTs, cookies, or full emails / matter titles by default.
 */

const SECRET_PATTERNS: Array<{ re: RegExp; replacement: string }> = [
  { re: /\bsk-[a-zA-Z0-9_-]{10,}\b/g, replacement: "[REDACTED_KEY]" },
  { re: /\bAIza[0-9A-Za-z_-]{20,}\b/g, replacement: "[REDACTED_KEY]" },
  {
    re: /\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g,
    replacement: "[REDACTED_JWT]",
  },
  { re: /\bBearer\s+[^\s]+/gi, replacement: "Bearer [REDACTED]" },
  {
    re: /\b(api[_-]?key|secret|token|password|service_role)\s*[:=]\s*["']?[^\s"',}]+/gi,
    replacement: "$1=[REDACTED]",
  },
  { re: /\bpostgres(?:ql)?:\/\/[^\s]+/gi, replacement: "postgresql://[REDACTED]" },
  { re: /\blzp_[a-zA-Z0-9_-]+\b/g, replacement: "[REDACTED_PROXY_TOKEN]" },
];

export function redactSecrets(input: string): string {
  let out = input;
  for (const { re, replacement } of SECRET_PATTERNS) {
    out = out.replace(re, replacement);
  }
  return out;
}

/** Truncate email to local***@domain for sparse logs. */
export function redactEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.indexOf("@");
  if (at <= 0) return "[email]";
  const local = email.slice(0, Math.min(2, at));
  return `${local}***@${email.slice(at + 1)}`;
}

function safeMeta(meta?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!meta) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (v === undefined) continue;
    if (/password|secret|token|authorization|cookie|key/i.test(k)) {
      out[k] = "[REDACTED]";
      continue;
    }
    if (typeof v === "string") {
      out[k] = redactSecrets(v).slice(0, 240);
    } else if (typeof v === "number" || typeof v === "boolean" || v === null) {
      out[k] = v;
    } else {
      out[k] = redactSecrets(JSON.stringify(v)).slice(0, 240);
    }
  }
  return out;
}

export function logInfo(scope: string, message: string, meta?: Record<string, unknown>) {
  const line = {
    level: "info",
    scope,
    message: redactSecrets(message),
    meta: safeMeta(meta),
    ts: new Date().toISOString(),
  };
  console.info(JSON.stringify(line));
}

export function logWarn(scope: string, message: string, meta?: Record<string, unknown>) {
  const line = {
    level: "warn",
    scope,
    message: redactSecrets(message),
    meta: safeMeta(meta),
    ts: new Date().toISOString(),
  };
  console.warn(JSON.stringify(line));
}

export function logError(scope: string, err: unknown, meta?: Record<string, unknown>) {
  const message =
    err instanceof Error
      ? redactSecrets(`${err.name}: ${err.message}`)
      : redactSecrets(String(err));
  const stack =
    err instanceof Error && err.stack
      ? redactSecrets(err.stack).split("\n").slice(0, 8).join("\n")
      : undefined;
  const line = {
    level: "error",
    scope,
    message,
    stack,
    meta: safeMeta(meta),
    ts: new Date().toISOString(),
  };
  console.error(JSON.stringify(line));
}
