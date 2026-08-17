/**
 * Health collectors for Phase 8 (P8-05).
 * Fast env checks stay cheap. DB and ops probes never leak secrets.
 */
import "server-only";

import fs from "node:fs";
import path from "node:path";
import { getPublicSupabaseConfig, getAppPublicUrl } from "@/lib/env";
import { isPortalEnabled } from "@/lib/portal/config";
import { APP_VERSION } from "@/lib/release/version";
import {
  dbCircuitRemainingMs,
  isDbCircuitOpen,
  isDbConnectivityError,
} from "@/lib/db/connectivity";
import { getDb, getSql, noteDbConnectivitySuccess, prepareDbRetry } from "@/lib/db";
import { firms } from "@/lib/db/schema";
import { extractSqlState } from "@/lib/diagnostics/redact";
import { EXPORT_KINDS } from "@/lib/export/registry";
import { redactSecrets } from "@/lib/ops/log";

export type HealthCheck = {
  name: string;
  ok: boolean;
  durationMs: number;
  safeDetail: string;
};

export type FailureClass = "connectivity" | "schema" | "config" | "other" | null;

async function timed(
  name: string,
  fn: () => Promise<{ ok: boolean; safeDetail: string }>,
): Promise<HealthCheck> {
  const started = Date.now();
  try {
    const result = await fn();
    return { name, durationMs: Date.now() - started, ...result };
  } catch (err) {
    return {
      name,
      ok: false,
      durationMs: Date.now() - started,
      safeDetail: safeErrorDetail(err),
    };
  }
}

function safeErrorDetail(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return redactSecrets(raw).slice(0, 180);
}

function classifyDbFailure(err: unknown): FailureClass {
  if (isDbConnectivityError(err)) return "connectivity";
  const sqlstate = extractSqlState(err);
  if (sqlstate === "42703" || sqlstate === "42P01") return "schema";
  return "other";
}

export function getFastHealth() {
  const supabase = getPublicSupabaseConfig();
  const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
  const hasServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const hasAuthSecret = Boolean(process.env.AUTH_SECRET);
  const appUrl = getAppPublicUrl();
  const ready = supabase.isConfigured && hasDatabaseUrl && hasServiceRole;

  return {
    ok: ready,
    service: "lexzim",
    version: APP_VERSION,
    environment: process.env.RAILWAY_ENVIRONMENT_NAME?.trim() || null,
    timestamp: new Date().toISOString(),
    portal: {
      enabled: isPortalEnabled(),
      path: "/portal",
      health: "/api/portal/health",
    },
    env: {
      supabaseUrl: supabase.isConfigured,
      databaseUrl: hasDatabaseUrl,
      serviceRole: hasServiceRole,
      authSecret: hasAuthSecret,
      appUrl: Boolean(appUrl),
      appUrlHttps: appUrl.startsWith("https://"),
      configured: ready,
    },
    circuit: {
      open: isDbCircuitOpen(),
      remainingMs: dbCircuitRemainingMs(),
    },
  };
}

type JournalFile = { entries?: Array<{ tag?: string }> };

function readJournalExpected(): {
  expectedCount: number;
  latestJournalTag: string | null;
  journalReadable: boolean;
} {
  try {
    const file = path.join(process.cwd(), "drizzle", "migrations", "meta", "_journal.json");
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as JournalFile;
    const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
    const last = entries[entries.length - 1];
    return {
      expectedCount: entries.length,
      latestJournalTag: last?.tag ?? null,
      journalReadable: true,
    };
  } catch {
    return { expectedCount: 0, latestJournalTag: null, journalReadable: false };
  }
}

export async function getDbStatus(): Promise<{
  ok: boolean;
  status: number;
  body: Record<string, unknown>;
}> {
  const journal = readJournalExpected();
  const circuit = {
    open: isDbCircuitOpen(),
    remainingMs: dbCircuitRemainingMs(),
  };

  if (!process.env.DATABASE_URL) {
    return {
      ok: false,
      status: 503,
      body: {
        ok: false,
        service: "lexzim-db",
        connected: false,
        failureClass: "config" as FailureClass,
        error: "DATABASE_URL missing",
        circuit,
        migrations: {
          ...journal,
          appliedCount: null,
          pendingCount: null,
          tablePresent: false,
        },
        timestamp: new Date().toISOString(),
      },
    };
  }

  try {
    prepareDbRetry();
    const sql = getSql();
    await sql`select 1 as ok`;

    const vectorRows = await sql`
      select exists(
        select 1 from pg_extension where extname = 'vector'
      ) as enabled
    `;
    const metaRows = await sql`
      select exists(
        select 1 from information_schema.tables
        where table_schema = 'public' and table_name = 'app_meta'
      ) as present
    `;
    const migTableRows = await sql`
      select exists(
        select 1 from information_schema.tables
        where table_schema = 'drizzle' and table_name = '__drizzle_migrations'
      ) as present
    `;
    const tablePresent = Boolean(migTableRows[0]?.present);
    let appliedCount: number | null = null;
    if (tablePresent) {
      const countRows = await sql`
        select count(*)::int as n from drizzle.__drizzle_migrations
      `;
      appliedCount = Number(countRows[0]?.n ?? 0);
    }

    const pendingCount =
      journal.journalReadable && appliedCount != null
        ? Math.max(0, journal.expectedCount - appliedCount)
        : null;

    noteDbConnectivitySuccess();

    const schemaReady =
      Boolean(metaRows[0]?.present) && pendingCount !== null && pendingCount === 0;
    const ok = Boolean(metaRows[0]?.present) && pendingCount === 0;
    const failureClass: FailureClass =
      pendingCount != null && pendingCount > 0 ? "schema" : !schemaReady ? "schema" : null;

    return {
      ok,
      status: 200,
      body: {
        ok,
        service: "lexzim-db",
        connected: true,
        pgvector: Boolean(vectorRows[0]?.enabled),
        appMetaTable: Boolean(metaRows[0]?.present),
        canMigrate: true,
        schemaReady,
        failureClass,
        circuit,
        migrations: {
          ...journal,
          appliedCount,
          pendingCount,
          tablePresent,
        },
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    const failureClass = classifyDbFailure(error);
    const sqlstate = extractSqlState(error);
    return {
      ok: false,
      status: 503,
      body: {
        ok: false,
        service: "lexzim-db",
        connected: failureClass !== "connectivity" && failureClass !== "config",
        failureClass,
        sqlstate,
        error:
          failureClass === "schema"
            ? "Database schema mismatch (pending migration or missing column). Run npm run db:migrate."
            : failureClass === "connectivity"
              ? "Cannot reach the database."
              : safeErrorDetail(error),
        circuit,
        migrations: {
          ...journal,
          appliedCount: null,
          pendingCount: journal.journalReadable ? journal.expectedCount : null,
          tablePresent: null,
        },
        timestamp: new Date().toISOString(),
      },
    };
  }
}

function aiProviderConfigured(): boolean {
  return Boolean(
    process.env.GEMINI_API_KEY?.trim() ||
      process.env.ANTHROPIC_API_KEY?.trim() ||
      process.env.OPENAI_API_KEY?.trim(),
  );
}

export async function collectOpsDiagnosticHealth(request: Request): Promise<{
  ok: boolean;
  checks: HealthCheck[];
  fast: ReturnType<typeof getFastHealth>;
  db: Record<string, unknown>;
}> {
  const started = Date.now();
  const fast = getFastHealth();
  const dbStatus = await getDbStatus();

  const checks: HealthCheck[] = [];

  checks.push({
    name: "env",
    ok: fast.ok,
    durationMs: 0,
    safeDetail: fast.ok ? "Required env flags present." : "Missing DATABASE_URL, Supabase URL, or service role.",
  });

  checks.push({
    name: "db",
    ok: Boolean(dbStatus.body.ok),
    durationMs: Date.now() - started,
    safeDetail:
      typeof dbStatus.body.error === "string"
        ? dbStatus.body.error
        : dbStatus.body.connected
          ? "Connected."
          : "Database check failed.",
  });

  checks.push({
    name: "db.circuit",
    ok: !fast.circuit.open,
    durationMs: 0,
    safeDetail: fast.circuit.open
      ? `Circuit open for ~${Math.ceil(fast.circuit.remainingMs / 1000)}s.`
      : "Circuit closed.",
  });

  const pending = (dbStatus.body.migrations as { pendingCount?: number | null } | undefined)
    ?.pendingCount;
  checks.push({
    name: "db.migrations",
    ok: pending === 0,
    durationMs: 0,
    safeDetail:
      pending == null
        ? "Could not compare journal to applied migrations."
        : pending === 0
          ? "All journal migrations applied."
          : `${pending} pending. Run npm run db:migrate.`,
  });

  const cookieHeader = request.headers.get("cookie");
  checks.push({
    name: "auth.cookie_path",
    ok: true,
    durationMs: 0,
    safeDetail:
      "Staff session cookies use path /. Portal cookie lz_portal_session also path /. No cookie values read.",
  });
  checks.push({
    name: "auth.cookie_header_present",
    ok: Boolean(cookieHeader && cookieHeader.length > 0),
    durationMs: 0,
    safeDetail: cookieHeader
      ? "Request includes a Cookie header (values not stored)."
      : "No Cookie header on this ops request.",
  });

  if (dbStatus.body.connected) {
    checks.push(
      await timed("db.firms_ping", async () => {
        const db = getDb();
        const rows = await db.select({ id: firms.id }).from(firms).limit(1);
        return {
          ok: true,
          safeDetail: `Read firms (limit 1), rows=${rows.length}.`,
        };
      }),
    );
  } else {
    checks.push({
      name: "db.firms_ping",
      ok: false,
      durationMs: 0,
      safeDetail: "Skipped: database not connected.",
    });
  }

  checks.push(
    await timed("exports.registry", async () => {
      const hasPractice = EXPORT_KINDS.includes("practice_report");
      const hasWeekly = EXPORT_KINDS.includes("finance_weekly");
      return {
        ok: hasPractice && hasWeekly,
        safeDetail: hasPractice && hasWeekly
          ? "practice_report and finance_weekly registered."
          : "Export registry missing expected builders.",
      };
    }),
  );

  checks.push({
    name: "ai.provider_configured",
    ok: aiProviderConfigured(),
    durationMs: 0,
    safeDetail: aiProviderConfigured()
      ? "At least one managed AI key env is set (value not returned)."
      : "No GEMINI_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY.",
  });

  const ok = checks
    .filter(
      (c) =>
        c.name !== "auth.cookie_header_present" && c.name !== "ai.provider_configured",
    )
    .every((c) => c.ok);

  return { ok, checks, fast, db: dbStatus.body };
}
