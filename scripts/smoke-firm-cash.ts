/**
 * Firm cash smoke test (funds transfer, petty cash, cash book, float).
 * Money paths run on the Training Demo Firm inside one transaction that is always rolled back.
 * T Pfigu is read only (balances and integrity).
 *
 *   npx tsx scripts/smoke-firm-cash.ts
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

const DEMO_FIRM_ID = "33fd55b1-f3b3-43d0-b75a-46217574da2c";
const TPFIGU_FIRM_ID = "6e68cf32-2ba7-48d4-af08-ffbb1262cf78";

class Rollback extends Error {}

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
}

async function expectError(label: string, fn: () => Promise<unknown>, match: RegExp) {
  try {
    await fn();
    check(label, false, "no error thrown");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    check(label, match.test(msg), msg);
  }
}

async function main() {
  const { getDb, runInTransaction } = await import("@/lib/db");
  const s = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  const { ensureGlAccountByCode } = await import("@/lib/gl/accounts");
  const { postManualJournal } = await import("@/lib/gl/journals");
  const fc = await import("@/lib/repos/firm-cash");
  const { createFirmExpense } = await import("@/lib/repos/firm-finance");
  const { fundFloat } = await import("@/lib/repos/disbursement-float");
  const { runFinanceIntegrity } = await import("@/lib/finance/integrity");

  console.log("T Pfigu (read only)");
  const tp = await fc.getFirmCashPositions(TPFIGU_FIRM_ID);
  for (const p of tp) console.log(`  ${p.code} ${p.label}: ${(p.balanceCents / 100).toFixed(2)}`);
  check("T Pfigu Business Cash Book shows 110.00", tp.find((p) => p.code === "1020")?.balanceCents === 11000);
  const tpMoves = await fc.listCashMovements(TPFIGU_FIRM_ID, "1020");
  for (const m of tpMoves) {
    console.log(`  ${m.entryDate.toISOString().slice(0, 10)} ${m.sourceType} in ${m.inCents} out ${m.outCents} bal ${m.balanceAfterCents} ${m.memo ?? ""}`);
  }
  const tpIntegrity = await runFinanceIntegrity(TPFIGU_FIRM_ID);
  for (const c of tpIntegrity.checks) if (!c.ok) console.log(`  integrity FAIL ${c.id}: ${c.detail}`);
  check("T Pfigu integrity all ok", tpIntegrity.ok, `${tpIntegrity.checks.length} checks`);

  const [demoUser] = await getDb()
    .select({ id: s.users.id })
    .from(s.users)
    .where(eq(s.users.firmId, DEMO_FIRM_ID))
    .limit(1);
  if (!demoUser) throw new Error("No Training Demo Firm user.");
  const uid = demoUser.id;
  const mp = { isManagingPartner: true };
  const staff = { isManagingPartner: false };
  const bal = (code: "1010" | "1020" | "1050" | "1060") => fc.getGlBalanceCents(DEMO_FIRM_ID, code);

  console.log("\nTraining Demo Firm (rolled back)");
  const before = await fc.getFirmCashPositions(DEMO_FIRM_ID);
  try {
    await runInTransaction(async () => {
      const start = { c: await bal("1020"), p: await bal("1050"), f: await bal("1060") };
      await expectError(
        "Transfer beyond cash book balance is refused",
        () => fc.transferFirmFunds(DEMO_FIRM_ID, uid, { fromAccount: "1020", toAccount: "1050", amountCents: start.c + 1 }, mp),
        /holds/,
      );

      const cash = await ensureGlAccountByCode(DEMO_FIRM_ID, "1020");
      const equity = await ensureGlAccountByCode(DEMO_FIRM_ID, "3010");
      await postManualJournal(
        DEMO_FIRM_ID,
        uid,
        {
          entryDate: new Date(),
          reference: "Smoke opening",
          memo: "Smoke test cash",
          lines: [
            { accountId: cash.id, debitCents: 50000, creditCents: 0 },
            { accountId: equity.id, debitCents: 0, creditCents: 50000 },
          ],
        },
        "opening",
        `smoke:${Date.now()}`,
      );
      check("Cash book funded by 500", (await bal("1020")) === start.c + 50000);

      const t1 = await fc.transferFirmFunds(DEMO_FIRM_ID, uid, { fromAccount: "1020", toAccount: "1050", amountCents: 10000, note: "Petty top-up" }, staff);
      check("Cash book to petty cash 100", (await bal("1050")) === start.p + 10000 && t1.entry.sourceType === "funds_transfer");
      const t2 = await fc.transferFirmFunds(DEMO_FIRM_ID, uid, { fromAccount: "1020", toAccount: "1060", amountCents: 30000 }, staff);
      check("Cash book to float 300 posts as float source", (await bal("1060")) === start.f + 30000 && t2.entry.sourceType === "float");

      await expectError("Staff cannot move money out of float", () =>
        fc.transferFirmFunds(DEMO_FIRM_ID, uid, { fromAccount: "1060", toAccount: "1020", amountCents: 100, note: "x" }, staff), /Managing Partner/);
      await expectError("Float withdrawal needs a reason", () =>
        fc.transferFirmFunds(DEMO_FIRM_ID, uid, { fromAccount: "1060", toAccount: "1020", amountCents: 100 }, mp), /reason/);
      await expectError("Same account refused", () =>
        fc.transferFirmFunds(DEMO_FIRM_ID, uid, { fromAccount: "1020", toAccount: "1020", amountCents: 100 }, mp), /different/);
      await expectError("Future date refused", () =>
        fc.transferFirmFunds(DEMO_FIRM_ID, uid, { fromAccount: "1020", toAccount: "1050", amountCents: 100, entryDate: new Date(Date.now() + 86400000 * 2) }, mp), /future/);

      const expenseBase = {
        expenseDate: new Date(),
        category: "9070",
        payee: "Smoke stationery",
        currency: "USD",
        matterId: null,
        paymentMethod: "Cash",
        notes: null,
        glAccountId: null,
        budgetMonth: null,
      };
      await createFirmExpense(DEMO_FIRM_ID, uid, { ...expenseBase, amountCents: 3000, paymentSource: "petty" });
      check("Petty cash spend 30 reduces petty cash", (await bal("1050")) === start.p + 7000);
      await expectError("Petty spend beyond balance refused", () =>
        createFirmExpense(DEMO_FIRM_ID, uid, { ...expenseBase, amountCents: start.p + 7001, paymentSource: "petty" }), /Petty Cash holds/);
      await createFirmExpense(DEMO_FIRM_ID, uid, { ...expenseBase, amountCents: 5000, paymentSource: "cashbook" });
      check("Cash book expense 50", (await bal("1020")) === start.c + 5000);

      await expectError("Float funding beyond cash book refused", () =>
        fundFloat(DEMO_FIRM_ID, uid, { amountCents: start.c + 5001, fromAccount: "1020", note: null }), /holds/);

      const transfers = await fc.listFirmTransfers(DEMO_FIRM_ID);
      const row1 = transfers.find((t) => t.entryId === t1.entry.id);
      check("Transfer history shows from and to", row1?.fromCode === "1020" && row1?.toCode === "1050" && row1.amountCents === 10000);

      await expectError("Reversal refused when petty cash cannot afford it", () =>
        fc.reverseFirmTransfer(DEMO_FIRM_ID, uid, t1.entry.id, "Smoke", mp), /holds/);
      await expectError("Staff cannot reverse", () =>
        fc.reverseFirmTransfer(DEMO_FIRM_ID, uid, t2.entry.id, "Smoke", staff), /Managing Partner/);
      await fc.reverseFirmTransfer(DEMO_FIRM_ID, uid, t2.entry.id, "Smoke reversal", mp);
      check("Float transfer reversed", (await bal("1060")) === start.f && (await bal("1020")) === start.c + 35000);
      await expectError("Double reversal refused", () =>
        fc.reverseFirmTransfer(DEMO_FIRM_ID, uid, t2.entry.id, "again", mp), /already been reversed/);

      const moves = await fc.listCashMovements(DEMO_FIRM_ID, "1020");
      check("Cash book running balance matches GL", moves[0]?.balanceAfterCents === (await bal("1020")));

      const positions = await fc.getFirmCashPositions(DEMO_FIRM_ID);
      check("Positions agree with balances", positions.find((p) => p.code === "1050")?.balanceCents === (await bal("1050")));

      const integrity = await runFinanceIntegrity(DEMO_FIRM_ID);
      for (const c of integrity.checks) if (!c.ok) console.log(`  integrity FAIL ${c.id}: ${c.detail}`);
      check("Demo integrity: new checks pass", integrity.checks
        .filter((c) => ["firm_cash_not_negative", "funds_transfers_cash_only", "float_not_negative", "gl_balanced"].includes(c.id))
        .every((c) => c.ok));

      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }

  const after = await fc.getFirmCashPositions(DEMO_FIRM_ID);
  check(
    "Demo firm unchanged after rollback",
    JSON.stringify(after) === JSON.stringify(before),
    after.map((p) => `${p.code}=${p.balanceCents}`).join(" "),
  );

  console.log(failures ? `\n${failures} FAILED` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
