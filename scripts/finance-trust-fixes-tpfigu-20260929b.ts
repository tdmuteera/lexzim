/**
 * T Pfigu follow-up to the 29 Sep trust update (firm answers, 29 Sep 2026 15:07):
 *  - Chikwama withdrawal and fee were on 21/09/2026: reverse the entries dated 29 Sep and re-post on 21 Sep.
 *  - Jeffery owes no disbursement (already recovered): remove the 323 opening cost advance.
 *
 *   npx tsx scripts/finance-trust-fixes-tpfigu-20260929b.ts            dry run (rolls back)
 *   npx tsx scripts/finance-trust-fixes-tpfigu-20260929b.ts --commit
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
const PRIOR = "tpfigu-trust-20260929";
const BATCH = "tpfigu-trust-20260929b";
const SHEET = "Bank - Trust Accounts as at 29092026.xlsx";
const REDATE = [
  { key: "chikwama-w", narrative: "Withdrawal R Chikwama (per client statement)" },
  { key: "chikwama-fee", narrative: "Withdrawal fee 1.5% on 2,000 (per client statement)" },
];

class DryRun extends Error {}

async function main() {
  const commit = process.argv.includes("--commit");
  const { getDb, runInTransaction } = await import("@/lib/db");
  const s = await import("@/lib/db/schema");
  const { and, eq, like, sql } = await import("drizzle-orm");
  const { postTrustLedgerEntry, reverseTrustEntry } = await import("@/lib/repos/trust");
  const { deleteDisbursement } = await import("@/lib/repos/billing");
  const { runFinanceIntegrity } = await import("@/lib/finance/integrity");

  const [importer] = await getDb()
    .select({ id: s.users.id })
    .from(s.users)
    .where(and(eq(s.users.firmId, FIRM_ID), eq(s.users.email, IMPORTER_EMAIL)))
    .limit(1);
  if (!importer) throw new Error("Importer not found.");

  try {
    await runInTransaction(async () => {
      const db = getDb();
      for (const r of REDATE) {
        const [orig] = await db
          .select()
          .from(s.trustLedgerEntries)
          .where(and(eq(s.trustLedgerEntries.firmId, FIRM_ID), eq(s.trustLedgerEntries.idempotencyKey, `${PRIOR}:${r.key}`)))
          .limit(1);
        if (!orig) throw new Error(`Entry ${PRIOR}:${r.key} not found.`);
        if (!orig.reversedById) {
          await reverseTrustEntry(
            FIRM_ID,
            { id: importer.id, isManagingPartner: true },
            orig.id,
            "Wrong date: firm confirmed the withdrawal was on 21/09/2026. Re-posted on the correct date.",
          );
        }
        await postTrustLedgerEntry(FIRM_ID, importer.id, {
          trustAccountId: orig.trustAccountId,
          matterId: orig.matterId,
          clientId: orig.clientId,
          entryType: "disbursement",
          amountCents: -orig.amountCents,
          currency: orig.currency,
          occurredAt: new Date("2026-09-21T12:00:00+02:00"),
          reference: null,
          referenceNumber: null,
          narrative: `${r.narrative} [${SHEET}]`,
          transferToAccountId: null,
          adjustmentCredit: false,
          allowNegative: false,
          idempotencyKey: `${BATCH}:${r.key}`,
          sourceType: "manual",
          sourceId: BATCH,
        });
      }

      const jeffery = await db
        .select({ id: s.disbursements.id, amountCents: s.disbursements.amountCents })
        .from(s.disbursements)
        .where(and(eq(s.disbursements.firmId, FIRM_ID), like(s.disbursements.description, "Cost advanced before 28 Sep 2026 (Mr Malcom Jeffery)%")));
      if (jeffery.length > 1) throw new Error("More than one Jeffery opening advance found.");
      if (jeffery[0]) {
        if (jeffery[0].amountCents !== 32300) throw new Error("Jeffery advance is not 323.");
        await deleteDisbursement(FIRM_ID, jeffery[0].id, importer.id);
      }

      const [chk] = (await db.execute(sql`
        select
          (select sum(t.amount_cents)::bigint from trust_ledger_entries t join clients c on c.id = t.client_id
            where t.firm_id = ${FIRM_ID} and c.client_number = 'CL0031') as chikwama,
          (select coalesce(sum(amount_cents),0)::bigint from disbursements where firm_id = ${FIRM_ID}) as advances`)) as unknown as { chikwama: string; advances: string }[];
      const integrity = await runFinanceIntegrity(FIRM_ID);
      const result = {
        mode: commit ? "commit" : "dry_run",
        chikwama: Number(chk!.chikwama) / 100,
        advances: Number(chk!.advances) / 100,
        failedChecks: integrity.checks.filter((c) => !c.ok).map((c) => `${c.id}: ${c.detail}`),
      };
      console.log(JSON.stringify(result, null, 2));
      if (result.chikwama !== 1821.5 || result.advances !== 296 || !integrity.ok) {
        throw new Error("Check failed. Nothing was saved.");
      }
      if (!commit) throw new DryRun("Dry run complete. Rolled back; nothing was saved.");
    });
    console.log("Committed.");
  } catch (e) {
    if (e instanceof DryRun) {
      console.log(e.message);
      return;
    }
    throw e;
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
