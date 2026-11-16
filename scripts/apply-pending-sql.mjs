import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import postgres from "postgres";

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
const sql = postgres(url, { max: 1, prepare: false });
const dir = path.join(process.cwd(), "drizzle", "migrations");
const files = [
  "0059_bank_statement_inbox.sql",
  "0060_finance_recurring.sql",
];

try {
  for (const file of files) {
    const full = path.join(dir, file);
    const body = fs.readFileSync(full, "utf8");
    const hash = crypto.createHash("sha256").update(body).digest("hex");
    console.log("applying", file, hash.slice(0, 12));
    await sql.unsafe(body);
    const existing = await sql`
      select 1 from drizzle.__drizzle_migrations where hash = ${hash} limit 1`;
    if (existing.length === 0) {
      await sql`
        insert into drizzle.__drizzle_migrations (hash, created_at)
        values (${hash}, ${Date.now()})`;
      console.log("recorded", file);
    } else {
      console.log("already recorded", file);
    }
  }
  const tables = await sql`
    select table_name from information_schema.tables
    where table_schema = 'public'
      and table_name in (
        'bank_statement_imports','bank_statement_lines','bank_match_rules',
        'finance_recurring_templates'
      )
    order by table_name`;
  console.log(
    "tables",
    tables.map((t) => t.table_name),
  );
  const count = await sql`select count(*)::int as n from drizzle.__drizzle_migrations`;
  console.log("applied", count[0].n);
} finally {
  await sql.end({ timeout: 5 });
}
