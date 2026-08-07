import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";

/**
 * Server-only Postgres client (Supabase).
 * Use pooled DATABASE_URL in production when available; SSL required by Supabase.
 */
const globalForDb = globalThis as unknown as {
  lexzimSql?: ReturnType<typeof postgres>;
};

function createSql() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set.");
  }

  return postgres(url, {
    prepare: false,
    max: 10,
    ssl: "require",
  });
}

export function getSql() {
  if (!globalForDb.lexzimSql) {
    globalForDb.lexzimSql = createSql();
  }
  return globalForDb.lexzimSql;
}

export function getDb() {
  return drizzle(getSql(), { schema });
}

export type Db = ReturnType<typeof getDb>;
