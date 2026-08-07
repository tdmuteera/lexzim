import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/db-status — connection + migration readiness smoke check.
 * Does not expose connection strings or passwords.
 */
export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      {
        ok: false,
        service: "lexzim-db",
        connected: false,
        error: "DATABASE_URL missing",
      },
      { status: 503 },
    );
  }

  try {
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

    return NextResponse.json({
      ok: true,
      service: "lexzim-db",
      connected: true,
      pgvector: Boolean(vectorRows[0]?.enabled),
      appMetaTable: Boolean(metaRows[0]?.present),
      canMigrate: true,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error";
    return NextResponse.json(
      {
        ok: false,
        service: "lexzim-db",
        connected: false,
        error: message,
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
