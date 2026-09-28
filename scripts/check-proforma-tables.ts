import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });
import postgres from "postgres";

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("No DATABASE_URL");
  const sql = postgres(url, { max: 1 });
  try {
    const rows = await sql`select to_regclass('public.pro_formas') as t, to_regclass('public.pro_forma_lines') as l`;
    console.log(rows);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
