/**
 * Redaction for diagnostic event payloads (P8-04).
 * Builds on lib/ops/log.ts; never store secrets, KYC, amounts, or matter titles.
 */
import { redactEmail, redactSecrets } from "@/lib/ops/log";

const FORBIDDEN_KEY =
  /password|secret|token|authorization|cookie|kyc|mattertitle|matter_title|amount|iban|smtp|service_role|database_url|api[_-]?key/i;

const MAX_STRING = 240;
const MAX_MESSAGE = 500;
const MAX_DEPTH = 4;
const MAX_KEYS = 40;

export function redactDiagnosticMessage(message: string | null | undefined): string {
  if (!message) return "";
  return redactSecrets(String(message)).slice(0, MAX_MESSAGE);
}

/** Path only; strip query string. */
export function sanitizeRoutePath(pathOrUrl: string | null | undefined): string | null {
  if (!pathOrUrl) return null;
  let path = pathOrUrl;
  try {
    if (path.includes("://")) {
      path = new URL(path).pathname;
    } else {
      const q = path.indexOf("?");
      if (q >= 0) path = path.slice(0, q);
    }
  } catch {
    const q = path.indexOf("?");
    if (q >= 0) path = path.slice(0, q);
  }
  path = path.trim();
  if (!path) return null;
  return redactSecrets(path).slice(0, 240);
}

export function redactDiagnosticPayload(
  input: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!input) return {};
  return redactValue(input, 0) as Record<string, unknown>;
}

function redactString(value: string): string {
  const at = value.indexOf("@");
  const looksLikeEmail =
    at > 0 && at < value.length - 1 && !value.includes(" ") && value.length < 254;
  const base = looksLikeEmail ? (redactEmail(value) ?? value) : value;
  return redactSecrets(base).slice(0, MAX_STRING);
}

function redactValue(value: unknown, depth: number): unknown {
  if (value == null) return value;
  if (depth > MAX_DEPTH) return "[truncated]";
  if (typeof value === "string") {
    return redactString(value);
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((v) => redactValue(v, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    let n = 0;
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (n >= MAX_KEYS) {
        out._truncated = true;
        break;
      }
      if (FORBIDDEN_KEY.test(k)) {
        out[k] = "[REDACTED]";
        n += 1;
        continue;
      }
      out[k] = redactValue(v, depth + 1);
      n += 1;
    }
    return out;
  }
  return redactSecrets(String(value)).slice(0, MAX_STRING);
}

export function extractSqlState(err: unknown): string | null {
  let cur: unknown = err;
  for (let i = 0; i < 4 && cur; i += 1) {
    if (typeof cur === "object" && cur && "code" in cur) {
      const code = String((cur as { code?: unknown }).code ?? "");
      if (/^[0-9A-Z]{5}$/.test(code) || /^08/.test(code) || code === "42703") {
        return code.slice(0, 16);
      }
    }
    if (cur instanceof Error) {
      cur = (cur as Error & { cause?: unknown }).cause;
    } else if (typeof cur === "object" && cur && "cause" in cur) {
      cur = (cur as { cause?: unknown }).cause;
    } else {
      break;
    }
  }
  return null;
}
