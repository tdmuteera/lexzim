import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";
import {
  assertDbCircuitClosed,
  clearDbUnavailable,
  isDbCircuitOpen,
  markDbUnavailable,
} from "@/lib/db/connectivity";

/**
 * Server-only Postgres client (Supabase).
 * Use pooled DATABASE_URL; SSL required. prepare:false required for transaction pooler.
 */
const globalForDb = globalThis as unknown as {
  lexzimSql?: ReturnType<typeof postgres>;
};

function createSql() {
  // Transaction pooler (DATABASE_URL) is the documented runtime connection.
  // DIRECT_URL is only a fallback so the app still boots if the pooled URL is absent.
  const url = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set.");
  }

  // Pooler handshakes from distant regions routinely take 3-7s here, so a very short
  // timeout turns a slow-but-healthy link into a hard outage.
  const connectTimeout = Number(process.env.DB_CONNECT_TIMEOUT_SEC ?? "30");
  const poolMax = Number(process.env.DB_POOL_MAX ?? "10");

  return postgres(url, {
    prepare: false,
    max: Number.isFinite(poolMax) && poolMax > 0 ? poolMax : 10,
    ssl: "require",
    connect_timeout:
      Number.isFinite(connectTimeout) && connectTimeout > 0 ? connectTimeout : 30,
    // Reconnecting costs several seconds on this link, so keep sockets warm longer.
    idle_timeout: 120,
    max_lifetime: 60 * 10,
  });
}

export function getSql() {
  assertDbCircuitClosed();
  if (!globalForDb.lexzimSql) {
    globalForDb.lexzimSql = createSql();
  }
  return globalForDb.lexzimSql;
}

/** Drop the cached client so the next request opens a fresh TCP/TLS session. */
export function resetDbClient() {
  const existing = globalForDb.lexzimSql;
  globalForDb.lexzimSql = undefined;
  if (existing) {
    void existing.end({ timeout: 1 }).catch(() => undefined);
  }
}

/**
 * Record a connectivity failure. The pool is intentionally left in place:
 * postgres.js reconnects per connection, and tearing it down here would abort
 * other requests' in-flight queries and cascade one timeout into many.
 */
export function noteDbConnectivityFailure() {
  markDbUnavailable();
}

export function noteDbConnectivitySuccess() {
  clearDbUnavailable();
}

/**
 * Let a request probe the database again after a connectivity failure.
 * Only tears down the pool when the circuit is actually open; destroying a healthy
 * pool would abort in-flight queries with CONNECTION_DESTROYED and force a slow
 * re-handshake on every request.
 */
export function prepareDbRetry() {
  if (!isDbCircuitOpen()) return;
  clearDbUnavailable();
  resetDbClient();
}

export function getDb() {
  return drizzle(getSql(), { schema });
}

export type Db = ReturnType<typeof getDb>;
