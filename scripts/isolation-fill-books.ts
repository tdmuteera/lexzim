/**
 * Fill Isolation Test Firm books so the guide can show money working.
 * Uses the same postings as the screens. Does not touch any other firm.
 *
 *   npx tsx scripts/isolation-fill-books.ts
 */
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { config } from "dotenv";

const require = createRequire(import.meta.url);
const so = require.resolve("server-only");
require.cache[so] = { id: so, filename: so, loaded: true, exports: {} };
config({ path: resolve(process.cwd(), ".env.local") });

const FIRM_SLUG = "isolation-test-firm";
const GUIDE_EMAIL = "guide.tester@lexzim.local";

const PAY_TO_BANK = ["INV-0090", "INV-0091", "INV-0092", "INV-0095"];
const PAY_TO_CASHBOOK = ["INV-0093"];
const LEAVE_OPEN = ["INV-0094", "INV-0096"];

async function main() {
  const { and, eq, inArray } = await import("drizzle-orm");
  const { getDb } = await import("../lib/db");
  const { clients, firms, invoices, matters, users } = await import("../lib/db/schema");
  const { updateInvoiceStatus, createFeePayment } = await import("../lib/repos/billing");
  const { createFirmExpense } = await import("../lib/repos/firm-finance");
  const { getFirmCashPositions, transferFirmFunds } = await import("../lib/repos/firm-cash");
  const { createTrustAccount, listTrustAccounts, postTrustLedgerEntry } = await import("../lib/repos/trust");

  const db = getDb();
  const firm = (await db.select().from(firms).where(eq(firms.slug, FIRM_SLUG)).limit(1))[0];
  if (!firm) throw new Error("Isolation Test Firm was not found. Nothing was written.");

  const user = (await db.select().from(users).where(eq(users.email, GUIDE_EMAIL)).limit(1))[0];
  if (!user || user.firmId !== firm.id) {
    throw new Error("Guide Tester is not on Isolation Test Firm. Nothing was written.");
  }

  const wanted = [...PAY_TO_BANK, ...PAY_TO_CASHBOOK, ...LEAVE_OPEN];
  const notes = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.firmId, firm.id), inArray(invoices.invoiceNumber, wanted)));
  if (notes.length !== wanted.length) {
    throw new Error(`Expected ${wanted.length} guide fee notes, found ${notes.length}. Nothing else was written.`);
  }

  const sent: string[] = [];
  for (const row of notes) {
    if (row.status !== "draft") continue;
    if (row.approvalState !== "approved") {
      await db
        .update(invoices)
        .set({
          approvalState: "approved",
          approvedAt: new Date(),
          approvedBy: user.id,
          updatedAt: new Date(),
        })
        .where(and(eq(invoices.firmId, firm.id), eq(invoices.id, row.id)));
    }
    await updateInvoiceStatus(firm.id, row.id, "sent", user.id);
    sent.push(row.invoiceNumber);
  }

  const fresh = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.firmId, firm.id), inArray(invoices.invoiceNumber, wanted)));

  const paid: string[] = [];
  const today = new Date();
  for (const row of fresh) {
    const toCashbook = PAY_TO_CASHBOOK.includes(row.invoiceNumber);
    const toBank = PAY_TO_BANK.includes(row.invoiceNumber);
    if (!toCashbook && !toBank) continue;
    if (row.status === "paid") continue;
    await createFeePayment(firm.id, user.id, row.id, {
      amountCents: row.totalCents,
      currency: row.currency,
      paidAt: today,
      method: toCashbook ? "cash" : "transfer",
      reference: `Guide ${row.invoiceNumber}`,
      notes: "Guide film receipt. Isolation practice only.",
      cashGlCode: toCashbook ? "1020" : "1010",
      idempotencyKey: `guide-film-pay-${row.invoiceNumber}`,
    });
    paid.push(row.invoiceNumber);
  }

  const cash = await getFirmCashPositions(firm.id);
  const bal = (code: string) => cash.find((p) => p.code === code)?.balanceCents ?? 0;
  const moved: string[] = [];
  if (bal("1050") < 15000 && bal("1010") >= 15000) {
    await transferFirmFunds(
      firm.id,
      user.id,
      { fromAccount: "1010", toAccount: "1050", amountCents: 15000, note: "Guide film petty cash float." },
      { isManagingPartner: true, currency: "USD" },
    );
    moved.push("petty 150");
  }
  if (bal("1060") < 40000 && bal("1010") >= 40000) {
    await transferFirmFunds(
      firm.id,
      user.id,
      { fromAccount: "1010", toAccount: "1060", amountCents: 40000, note: "Guide film disbursement float to the monthly target." },
      { isManagingPartner: true, currency: "USD" },
    );
    moved.push("float 400");
  }

  const { firmExpenses } = await import("../lib/db/schema");
  const { like } = await import("drizzle-orm");
  const existingExpense = await db
    .select({ id: firmExpenses.id })
    .from(firmExpenses)
    .where(and(eq(firmExpenses.firmId, firm.id), like(firmExpenses.notes, "Guide film office supplies%")))
    .limit(1);
  if (!existingExpense[0]) {
    await createFirmExpense(firm.id, user.id, {
      expenseDate: today,
      category: "office",
      payee: "Office stationery",
      amountCents: 3500,
      currency: "USD",
      matterId: null,
      paymentMethod: "cash",
      notes: "Guide film office supplies. Isolation practice only.",
      glAccountId: null,
      paymentSource: "petty",
      budgetMonth: "2026-10",
    });
    moved.push("expense 35");
  }

  const rudo = (
    await db
      .select()
      .from(clients)
      .where(and(eq(clients.firmId, firm.id), eq(clients.fullName, "Rudo Ncube")))
      .limit(1)
  )[0];
  const matter = rudo
    ? (
        await db
          .select()
          .from(matters)
          .where(and(eq(matters.firmId, firm.id), eq(matters.clientId, rudo.id), eq(matters.title, "Ncube v Dube")))
          .limit(1)
      )[0]
    : null;
  if (!rudo || !matter) throw new Error("Rudo Ncube or Ncube v Dube was not found. Trust was not posted.");

  let accounts = await listTrustAccounts(firm.id, true);
  let bank = accounts.find((a) => a.accountKind === "bank" && a.currency === "USD");
  if (!bank) {
    bank = await createTrustAccount(firm.id, {
      name: "Client trust account",
      currency: "USD",
      accountRef: "GUIDE-TRUST",
      accountKind: "bank",
      isActive: true,
    });
  }
  const trust = await postTrustLedgerEntry(firm.id, user.id, {
    trustAccountId: bank.id,
    matterId: matter.id,
    clientId: rudo.id,
    entryType: "receipt",
    amountCents: 150000,
    currency: "USD",
    occurredAt: today,
    reference: "Guide trust receipt",
    referenceNumber: null,
    narrative: "Client money received for Ncube v Dube. Isolation practice only.",
    transferToAccountId: null,
    adjustmentCredit: true,
    allowNegative: false,
    idempotencyKey: "guide-film-trust-rudo",
  });

  const after = await getFirmCashPositions(firm.id);
  console.log(
    JSON.stringify({
      firm: firm.name,
      sent,
      paid,
      moved,
      trustReplayed: Boolean(trust.replayed),
      cash: after.map((p) => ({ code: p.code, cents: p.balanceCents })),
    }),
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
