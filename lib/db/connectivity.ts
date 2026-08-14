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

export function isDbConnectivityError(err: unknown): boolean {
  if (err instanceof DatabaseUnavailableError) return true;
  const parts: string[] = [];
  let cur: unknown = err;
  for (let i = 0; i < 4 && cur; i += 1) {
    if (cur instanceof Error) {
      parts.push(cur.message, cur.name);
      cur = (cur as Error & { cause?: unknown }).cause;
    } else if (typeof cur === "object" && cur && "code" in cur) {
      parts.push(String((cur as { code?: string }).code));
      cur = (cur as { cause?: unknown }).cause;
    } else {
      parts.push(String(cur));
      break;
    }
  }
  const text = parts.join(" ");
  return /CONNECT_TIMEOUT|ECONNRESET|ENOTFOUND|ECONNREFUSED|EHOSTUNREACH|ETIMEDOUT|getaddrinfo|Connection terminated|ssl|TLS|Failed query|database_unavailable|Database marked unreachable/i.test(
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
