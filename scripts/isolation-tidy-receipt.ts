/**
 * Isolation only. The guide receipt was labelled "Guide INV-0091".
 * Change that label to ordinary wording. Does not repost the ledger.
 */
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { config } from "dotenv";

const require = createRequire(import.meta.url);
const so = require.resolve("server-only");
require.cache[so] = { id: so, filename: so, loaded: true, exports: {} };
config({ path: resolve(process.cwd(), ".env.local") });

async function main() {
  const { and, eq, like } = await import("drizzle-orm");
  const { getDb } = await import("../lib/db");
  const { feePayments, firms } = await import("../lib/db/schema");
  const db = getDb();
  const firm = (await db.select().from(firms).where(eq(firms.slug, "isolation-test-firm")).limit(1))[0];
  if (!firm) throw new Error("Isolation Test Firm was not found. Nothing was written.");
  const rows = await db
    .update(feePayments)
    .set({ reference: "October fees" })
    .where(and(eq(feePayments.firmId, firm.id), like(feePayments.reference, "Guide %")))
    .returning({ id: feePayments.id });
  console.log(JSON.stringify({ firm: firm.name, labels: rows.length }));
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
