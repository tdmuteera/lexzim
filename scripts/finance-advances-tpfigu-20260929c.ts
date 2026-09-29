/**
 * T Pfigu firm answers, 29 Sep 2026 15:29 to 15:30:
 *  - Bristow: ignore the 190 advance (remove it).
 *  - Taguta, Kahembe, Granola, Danet: show as disbursements paid with company funds from the
 *    disbursement account (float, GL 1060), pending payment of the client's invoice.
 *    The float is funded with the 55 of company money used before cutover, each advance is then
 *    paid from it, and a paid recoverable requisition is recorded so "Mark recovered" returns the
 *    money to the float once the invoice is paid.
 *
 *   npx tsx scripts/finance-advances-tpfigu-20260929c.ts            dry run (rolls back)
 *   npx tsx scripts/finance-advances-tpfigu-20260929c.ts --commit
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
const BATCH = "tpfigu-advances-20260929c";
const CUTOVER = new Date("2026-09-28T12:00:00+02:00");
const PREFIX = "Cost advanced before 28 Sep 2026 (";
const TO_FLOAT: [string, number][] = [
  ["Taguta", 30],
  ["Kahembe", 10],
  ["Granola", 10],
  ["Danet", 5],
];

class DryRun extends Error {}

async function main() {
  const commit = process.argv.includes("--commit");
  const { getDb, runInTransaction } = await import("@/lib/db");
  const s = await import("@/lib/db/schema");
  const { and, eq, like, sql } = await import("drizzle-orm");
  const { deleteDisbursement } = await import("@/lib/repos/billing");
  const { ensureGlAccountByCode } = await import("@/lib/gl/accounts");
  const { postManualJournal, reverseJournalBySource } = await import("@/lib/gl/journals");
  const { postDisbursementGl } = await import("@/lib/gl/posting-disbursements");
  const { runFinanceIntegrity } = await import("@/lib/finance/integrity");

  const [importer] = await getDb()
    .select({ id: s.users.id })
    .from(s.users)
    .where(and(eq(s.users.firmId, FIRM_ID), eq(s.users.email, IMPORTER_EMAIL)))
    .limit(1);
  if (!importer) throw new Error("Importer not found.");

  const findAdvance = async (name: string) => {
    const rows = await getDb()
      .select({
        id: s.disbursements.id,
        amountCents: s.disbursements.amountCents,
        matterId: s.disbursements.matterId,
        requisitionId: s.disbursements.requisitionId,
        clientId: s.matters.clientId,
      })
      .from(s.disbursements)
      .innerJoin(s.matters, eq(s.matters.id, s.disbursements.matterId))
      .where(and(eq(s.disbursements.firmId, FIRM_ID), like(s.disbursements.description, `${PREFIX}${name})%`)));
    if (rows.length > 1) throw new Error(`More than one opening advance for ${name}.`);
    return rows[0] ?? null;
  };

  try {
    await runInTransaction(async () => {
      const db = getDb();

      const bristow = await findAdvance("Bristow");
      if (bristow) {
        if (bristow.amountCents !== 19000) throw new Error("Bristow advance is not 190.");
        await deleteDisbursement(FIRM_ID, bristow.id, importer.id);
      }

      const targets = [];
      for (const [name, amount] of TO_FLOAT) {
        const d = await findAdvance(name);
        if (!d) throw new Error(`Opening advance for ${name} not found.`);
        if (d.requisitionId) throw new Error(`${name} advance is already on a requisition.`);
        if (d.amountCents !== Math.round(amount * 100)) throw new Error(`${name} advance is not ${amount}.`);
        targets.push({ name, ...d });
      }
      const total = targets.reduce((a, t) => a + t.amountCents, 0);

      const float = await ensureGlAccountByCode(FIRM_ID, "1060");
      const equity = await ensureGlAccountByCode(FIRM_ID, "3010");
      await postManualJournal(
        FIRM_ID,
        importer.id,
        {
          entryDate: CUTOVER,
          reference: "Opening float",
          memo: "Disbursement account: company funds used before 28 Sep 2026 for Taguta, Kahembe, Granola and Danet",
          lines: [
            { accountId: float.id, debitCents: total, creditCents: 0, currency: "USD" },
            { accountId: equity.id, debitCents: 0, creditCents: total, currency: "USD" },
          ],
        },
        "float",
        `opening:${BATCH}`,
      );

      for (const t of targets) {
        await reverseJournalBySource(
          FIRM_ID,
          importer.id,
          "expense",
          `disb-${t.id}`,
          `Re-posted as paid from the disbursement account (firm decision 29 Sep 2026): ${t.name}`,
        );
        const description = `Paid from disbursement account (company funds) before 28 Sep 2026 (${t.name}), pending payment of invoice`;
        await db
          .update(s.disbursements)
          .set({ paidFrom: "firm_float", description, glPostedAt: null })
          .where(eq(s.disbursements.id, t.id));
        await postDisbursementGl(FIRM_ID, importer.id, t.id);

        const [req] = await db
          .insert(s.financeRequisitions)
          .values({
            firmId: FIRM_ID,
            type: "disbursement",
            status: "paid",
            clientId: t.clientId,
            matterId: t.matterId,
            nature: "Disbursement",
            description,
            amountCents: t.amountCents,
            currency: "USD",
            requestedBy: importer.id,
            approvedBy: importer.id,
            approvedAt: CUTOVER,
            paidAt: CUTOVER,
            paidBy: importer.id,
            paymentRef: `Opening balance 28 Sep 2026 (${BATCH})`,
            paidFrom: "firm_float",
            recoverable: true,
            disbursementId: t.id,
          })
          .returning({ id: s.financeRequisitions.id });
        await db.update(s.disbursements).set({ requisitionId: req!.id }).where(eq(s.disbursements.id, t.id));
      }

      const [chk] = (await db.execute(sql`
        select
          (select coalesce(sum(amount_cents),0)::bigint from disbursements where firm_id = ${FIRM_ID}) as advances,
          (select coalesce(sum(amount_cents),0)::bigint from disbursements where firm_id = ${FIRM_ID} and paid_from = 'firm_float') as via_float,
          (select count(*)::int from finance_requisitions where firm_id = ${FIRM_ID} and recoverable) as recoverable_reqs`)) as unknown as Record<string, string>[];
      const integrity = await runFinanceIntegrity(FIRM_ID);
      const gl = (code: string) => {
        const c = integrity.checks.find((x) => x.id === (code === "1060" ? "float_not_negative" : "advances_vs_gl_1320"));
        return c?.detail;
      };
      const result = {
        mode: commit ? "commit" : "dry_run",
        advances: Number(chk!.advances) / 100,
        viaFloat: Number(chk!.via_float) / 100,
        recoverableRequisitions: Number(chk!.recoverable_reqs),
        float: gl("1060"),
        advancesCheck: gl("1320"),
        failedChecks: integrity.checks.filter((c) => !c.ok).map((c) => `${c.id}: ${c.detail}`),
      };
      console.log(JSON.stringify(result, null, 2));
      if (result.advances !== 106 || result.viaFloat !== 55 || result.recoverableRequisitions !== 4 || !integrity.ok) {
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
