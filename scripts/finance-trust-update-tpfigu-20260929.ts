/**
 * T Pfigu: bring bank trust in line with "Bank - Trust Accounts as at 29092026.xlsx".
 * Movements are posted as ordinary trust entries on their statement dates (reversible from the Trust ledger).
 *
 *   npx tsx scripts/finance-trust-update-tpfigu-20260929.ts           dry run (rolls back)
 *   npx tsx scripts/finance-trust-update-tpfigu-20260929.ts --commit
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
const BATCH = "tpfigu-trust-20260929";
const SHEET = "Bank - Trust Accounts as at 29092026.xlsx";

type Move = {
  key: string;
  client: string;
  date: string;
  entryType: "receipt" | "disbursement" | "adjustment";
  amount: number;
  narrative: string;
};

const MOVES: Move[] = [
  { key: "zokwa-deposit", client: "CL0060", date: "2026-09-08", entryType: "receipt", amount: 1000, narrative: "Trust deposit (per client statement)" },
  { key: "mafuka-w1", client: "CL0049", date: "2026-09-03", entryType: "disbursement", amount: 30000, narrative: "Withdrawal: sale of property (per client statement)" },
  { key: "mafuka-w2", client: "CL0049", date: "2026-09-11", entryType: "disbursement", amount: 6000, narrative: "Withdrawal: sale of property (per client statement)" },
  { key: "chikwama-w", client: "CL0031", date: "2026-09-29", entryType: "disbursement", amount: 2000, narrative: "Withdrawal R Chikwama, September 2026 (per statement as at 29.9.2026; exact date not stated)" },
  { key: "chikwama-fee", client: "CL0031", date: "2026-09-29", entryType: "disbursement", amount: 30, narrative: "Withdrawal fee 1.5% on 2,000 (per statement)" },
  { key: "chikwama-corr", client: "CL0031", date: "2026-09-29", entryType: "adjustment", amount: 793.5, narrative: "Correction: 28 Sep opening figure 4,645 exceeded the client statement balance at 31 Aug 2026 (3,851.50) by 793.50. To confirm with the firm." },
];

const EXPECTED: Record<string, number> = {
  CL0031: 1821.5,
  CL0063: 24100,
  CL0064: 7570,
  CL0028: 650,
  CL0065: 2689,
  CL0050: 2000,
  CL0049: 18000,
  CL0033: 93000,
  CL0060: 1740,
  CL0029: 110,
};
const EXPECTED_BANK_TOTAL = 151680.5;

const RENAMES: { number: string; firstName: string | null; surname: string | null; fullName: string; extra?: Record<string, string> }[] = [
  { number: "CL0031", firstName: "Rickson and Tsitsi", surname: "Chikwama", fullName: "Rickson and Tsitsi Chikwama" },
  { number: "CL0063", firstName: "Martha", surname: "Chikwama", fullName: "Martha Chikwama" },
  {
    number: "CL0064",
    firstName: null,
    surname: null,
    fullName: "Estate Late Sydney William Bristow",
    extra: { physicalAddress: "3 Ridgeview Flats, 147 King George Road, Avondale, Harare" },
  },
];

class DryRun extends Error {}

async function main() {
  const commit = process.argv.includes("--commit");
  const { getDb, runInTransaction } = await import("@/lib/db");
  const s = await import("@/lib/db/schema");
  const { and, eq, sql } = await import("drizzle-orm");
  const { postTrustLedgerEntry } = await import("@/lib/repos/trust");
  const { runFinanceIntegrity } = await import("@/lib/finance/integrity");

  const db = getDb();
  const [importer] = await db
    .select({ id: s.users.id })
    .from(s.users)
    .where(and(eq(s.users.firmId, FIRM_ID), eq(s.users.email, IMPORTER_EMAIL)))
    .limit(1);
  const [bank] = await db
    .select({ id: s.trustAccounts.id })
    .from(s.trustAccounts)
    .where(and(eq(s.trustAccounts.firmId, FIRM_ID), eq(s.trustAccounts.name, "Trust Bank")))
    .limit(1);
  if (!importer || !bank) throw new Error("Importer or Trust Bank account not found.");

  const clientId = async (number: string) => {
    const [c] = await getDb()
      .select({ id: s.clients.id })
      .from(s.clients)
      .where(and(eq(s.clients.firmId, FIRM_ID), eq(s.clients.clientNumber, number)))
      .limit(1);
    if (!c) throw new Error(`Client ${number} not found.`);
    return c.id;
  };

  try {
    await runInTransaction(async () => {
      for (const m of MOVES) {
        await postTrustLedgerEntry(FIRM_ID, importer.id, {
          trustAccountId: bank.id,
          matterId: null,
          clientId: await clientId(m.client),
          entryType: m.entryType,
          amountCents: Math.round(m.amount * 100),
          currency: "USD",
          occurredAt: new Date(`${m.date}T12:00:00+02:00`),
          reference: null,
          referenceNumber: null,
          narrative: `${m.narrative} [${SHEET}]`,
          transferToAccountId: null,
          adjustmentCredit: false,
          allowNegative: false,
          idempotencyKey: `${BATCH}:${m.key}`,
          sourceType: "manual",
          sourceId: BATCH,
        });
      }

      for (const r of RENAMES) {
        await getDb()
          .update(s.clients)
          .set({ firstName: r.firstName, surname: r.surname, fullName: r.fullName, ...(r.extra ?? {}), updatedAt: new Date() })
          .where(and(eq(s.clients.firmId, FIRM_ID), eq(s.clients.clientNumber, r.number)));
      }

      const rows = (await getDb().execute(sql`
        select c.client_number, sum(t.amount_cents)::bigint as bal
        from trust_ledger_entries t join clients c on c.id = t.client_id
        where t.trust_account_id = ${bank.id}
        group by c.client_number`)) as unknown as { client_number: string; bal: string }[];
      const got = Object.fromEntries(rows.map((r) => [r.client_number, Number(r.bal) / 100]));
      const total = Object.values(got).reduce((a, b) => a + b, 0);
      const mismatches = Object.entries(EXPECTED).filter(([k, v]) => got[k] !== v);
      const extra = Object.keys(got).filter((k) => !(k in EXPECTED));
      const integrity = await runFinanceIntegrity(FIRM_ID);

      console.log(JSON.stringify({
        mode: commit ? "commit" : "dry_run",
        bankBalances: got,
        bankTotal: total,
        mismatches,
        extra,
        integrity: integrity.checks.filter((c) => !c.ok).map((c) => `${c.id}: ${c.detail}`),
        integrityOk: integrity.ok,
      }, null, 2));

      if (mismatches.length || extra.length || Math.abs(total - EXPECTED_BANK_TOTAL) > 0.001 || !integrity.ok) {
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
