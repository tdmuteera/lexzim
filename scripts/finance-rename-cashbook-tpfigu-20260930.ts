/**
 * T Pfigu request, 30 Sep 2026: rename the cash vault to "Business Cash Book".
 * Renames GL account 1020 (name and description only; no amounts or postings change).
 *
 *   npx tsx scripts/finance-rename-cashbook-tpfigu-20260930.ts            dry run
 *   npx tsx scripts/finance-rename-cashbook-tpfigu-20260930.ts --commit
 */
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { config } from "dotenv";

const require = createRequire(import.meta.url);
{
  const so = require.resolve("server-only");
  require.cache[so] = { id: so, filename: so, loaded: true, exports: {} } as NodeModule;
}
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const FIRM_ID = "6e68cf32-2ba7-48d4-af08-ffbb1262cf78";
const IMPORTER_EMAIL = "tech@tpfiguattorneys.com";
const RENAMES = [
  { code: "1020", name: "Business Cash Book", description: "Firm cash held on premises (cash fee receipts)" },
];

async function main() {
  const commit = process.argv.includes("--commit");
  const { getDb } = await import("@/lib/db");
  const s = await import("@/lib/db/schema");
  const { and, eq } = await import("drizzle-orm");
  const { writeAuditLog } = await import("@/lib/auth/audit");

  const [importer] = await getDb()
    .select({ id: s.users.id })
    .from(s.users)
    .where(and(eq(s.users.firmId, FIRM_ID), eq(s.users.email, IMPORTER_EMAIL)))
    .limit(1);
  if (!importer) throw new Error("Importer not found.");

  for (const r of RENAMES) {
    const [acct] = await getDb()
      .select({ id: s.glAccounts.id, name: s.glAccounts.name, description: s.glAccounts.description })
      .from(s.glAccounts)
      .where(and(eq(s.glAccounts.firmId, FIRM_ID), eq(s.glAccounts.code, r.code)))
      .limit(1);
    if (!acct) {
      console.log(`${r.code}: not found, skipped`);
      continue;
    }
    if (acct.name === r.name && acct.description === r.description) {
      console.log(`${r.code}: already "${r.name}"`);
      continue;
    }
    console.log(`${r.code}: "${acct.name}" -> "${r.name}"${commit ? "" : " (dry run)"}`);
    if (!commit) continue;
    await getDb()
      .update(s.glAccounts)
      .set({ name: r.name, description: r.description, updatedAt: new Date() })
      .where(eq(s.glAccounts.id, acct.id));
    await writeAuditLog({
      action: "gl_account.rename",
      firmId: FIRM_ID,
      userId: importer.id,
      entityType: "gl_account",
      entityId: acct.id,
      metadata: {
        code: r.code,
        before: { name: acct.name, description: acct.description },
        after: { name: r.name, description: r.description },
        batch: "tpfigu-rename-cashbook-20260930",
      },
      ipOrUserAgent: "script",
    });
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
