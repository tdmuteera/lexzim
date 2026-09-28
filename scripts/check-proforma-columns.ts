import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });
import postgres from "postgres";

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("No DATABASE_URL");
  const sql = postgres(url, { max: 1 });
  try {
    const cols = await sql`
      select column_name, data_type
      from information_schema.columns
      where table_schema = 'public' and table_name = 'pro_formas'
      order by ordinal_position
    `;
    console.log("pro_formas columns:", cols);
    const lineCols = await sql`
      select column_name, data_type
      from information_schema.columns
      where table_schema = 'public' and table_name = 'pro_forma_lines'
      order by ordinal_position
    `;
    console.log("pro_forma_lines columns:", lineCols);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
