import "server-only";

/**
 * Helpers for Supabase / Postgres connectivity failures (pooler timeouts, TLS resets).
 */

export class DatabaseUnavailableError extends Error {
  readonly code = "database_unavailable";

  constructor(message = "Cannot reach the database.") {
    super(message);
    this.name = "DatabaseUnavailableError";
  }
}

const globalCircuit = globalThis as unknown as {
  lexzimDbDownUntil?: number;
};

/**
 * How long to skip reconnect attempts after a connectivity failure.
 * Kept short: a single slow handshake should not lock the whole app out for a minute.
 */
const COOLDOWN_MS = Number(process.env.DB_CIRCUIT_COOLDOWN_MS ?? "8000");

export function markDbUnavailable(ms = COOLDOWN_MS) {
  globalCircuit.lexzimDbDownUntil = Date.now() + ms;
}

export function clearDbUnavailable() {
  globalCircuit.lexzimDbDownUntil = undefined;
}

export function isDbCircuitOpen(): boolean {
  const until = globalCircuit.lexzimDbDownUntil;
  return typeof until === "number" && Date.now() < until;
}

export function dbCircuitRemainingMs(): number {
  const until = globalCircuit.lexzimDbDownUntil ?? 0;
  return Math.max(0, until - Date.now());
}

export function assertDbCircuitClosed() {
  if (!isDbCircuitOpen()) return;
  const secs = Math.ceil(dbCircuitRemainingMs() / 1000);
  throw new DatabaseUnavailableError(
    `Database marked unreachable (retry in ~${secs}s). Network cannot reach Supabase pooler.`,
  );
}

/**
 * Postgres SQLSTATE class 08 ("connection_exception") codes, plus the string
 * codes postgres.js itself raises for socket/handshake failures. These are the
 * only `code` values that indicate the *link* is broken, as opposed to a query
 * being malformed, forbidden, or violating a constraint.
 */
const CONNECTIVITY_CODES = new Set([
  "08000",
  "08001",
  "08003",
  "08004",
  "08006",
  "08007",
  "08P01",
  "CONNECT_TIMEOUT",
  "CONNECTION_CLOSED",
  "CONNECTION_DESTROYED",
  "CONNECTION_ENDED",
  "ECONNRESET",
  "ENOTFOUND",
  "ECONNREFUSED",
  "EHOSTUNREACH",
  "ETIMEDOUT",
]);

/**
 * Walk an error's `.cause` chain (up to 4 levels) looking for a genuine
 * transport-level failure. Deliberately does NOT match on generic wrapper
 * text like "Failed query", which postgres.js/drizzle attach to *every*
 * query error (syntax errors, missing columns, constraint violations, etc.)
 * regardless of whether the connection itself is healthy. Matching on that
 * text would mislabel real query/schema bugs as "database unreachable".
 */
export function isDbConnectivityError(err: unknown): boolean {
  if (err instanceof DatabaseUnavailableError) return true;
  const messages: string[] = [];
  let cur: unknown = err;
  for (let i = 0; i < 4 && cur; i += 1) {
    if (cur instanceof Error) {
      const code = (cur as Error & { code?: string }).code;
      if (code && CONNECTIVITY_CODES.has(String(code))) return true;
      messages.push(cur.message);
      cur = (cur as Error & { cause?: unknown }).cause;
    } else if (typeof cur === "object" && cur && "code" in cur) {
      const code = String((cur as { code?: string }).code);
      if (CONNECTIVITY_CODES.has(code)) return true;
      cur = (cur as { cause?: unknown }).cause;
    } else {
      break;
    }
  }
  const text = messages.join(" ");
  return /CONNECT_TIMEOUT|ECONNRESET|ENOTFOUND|ECONNREFUSED|EHOSTUNREACH|ETIMEDOUT|getaddrinfo|Connection terminated|TLS handshake|SSL connection|database_unavailable|Database marked unreachable/i.test(
    text,
  );
}

export function asDatabaseUnavailable(err: unknown): DatabaseUnavailableError | null {
  if (err instanceof DatabaseUnavailableError) return err;
  if (!isDbConnectivityError(err)) return null;
  return new DatabaseUnavailableError(
    "Cannot reach Supabase Postgres (connection timeout). Check network, VPN, or DATABASE_URL pooler settings.",
  );
}

/** Re-throw Next.js redirects; otherwise return a DB-unavailable error for friendly UI. */
export function getDbUnavailableFromError(
  err: unknown,
  isRedirect: (e: unknown) => boolean,
): DatabaseUnavailableError | null {
  if (isRedirect(err)) throw err;
  if (err instanceof DatabaseUnavailableError) return err;
  return asDatabaseUnavailable(err);
}
