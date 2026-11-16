import postgres from "postgres";

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("no db url");
  process.exit(1);
}
console.log("host", new URL(url).host);
const sql = postgres(url, { max: 1, prepare: false });
try {
  const count = await sql`select count(*)::int as n from drizzle.__drizzle_migrations`;
  console.log("applied", count[0].n);
  const tables = await sql`
    select table_name from information_schema.tables
    where table_schema = 'public'
      and table_name in ('bank_statement_imports','bank_statement_lines','finance_recurring_rules')
    order by table_name`;
  console.log(
    "tables",
    tables.map((t) => t.table_name),
  );
} finally {
  await sql.end({ timeout: 5 });
}
