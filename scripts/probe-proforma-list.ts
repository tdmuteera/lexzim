import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });

async function main() {
  const { listProformas } = await import("../lib/repos/proformas");
  const { getDb } = await import("../lib/db");
  const { firms } = await import("../lib/db/schema");
  const db = getDb();
  const rows = await db.select({ id: firms.id, slug: firms.slug }).from(firms).limit(5);
  console.log("firms", rows);
  for (const f of rows) {
    try {
      const items = await listProformas(f.id);
      console.log(f.slug, "proformas", items.length);
    } catch (e) {
      console.error(f.slug, "FAIL", e);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
