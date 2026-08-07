import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

const sql = postgres(url, {
  ssl: "require",
  prepare: false,
  connect_timeout: 30,
});

async function main() {
  try {
    const ping = await sql`select 1 as ok`;
    console.log("ping", ping);

    try {
      await sql`CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions`;
      console.log("vector extension: ok (extensions schema)");
    } catch (err) {
      console.warn("vector with schema extensions failed, trying public…", err);
      await sql`CREATE EXTENSION IF NOT EXISTS vector`;
      console.log("vector extension: ok (default schema)");
    }

    await sql`
      CREATE TABLE IF NOT EXISTS app_meta (
        key text PRIMARY KEY NOT NULL,
        value text NOT NULL,
        updated_at timestamptz DEFAULT now() NOT NULL
      )
    `;
    console.log("app_meta: ok");

    const vector = await sql`
      select exists(select 1 from pg_extension where extname = 'vector') as enabled
    `;
    console.log("pgvector enabled:", vector[0]?.enabled);
  } catch (error) {
    console.error("ERR", error);
    process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main();
