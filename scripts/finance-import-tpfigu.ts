/**
 * T Pfigu Attorneys: opening balances at cutover 28 Sep 2026.
 *
 * Figures come from the reviewed dry run (scripts/finance-migration-dryrun.ts) and the firm's
 * decisions of 29 Sep 2026. Every posting goes through the application's own finance functions,
 * inside one database transaction, so trust ledger, invoices, advances and GL commit together.
 *
 *   npx tsx scripts/finance-import-tpfigu.ts            dry run: posts everything, checks integrity, rolls back
 *   npx tsx scripts/finance-import-tpfigu.ts --commit   live import (refuses if T Pfigu already has finance rows)
 *   npx tsx scripts/finance-import-tpfigu.ts --rollback <manifest.json>
 *                                                        removes exactly what a live run created, if nothing else
 *                                                        has been posted against it since
 */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
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
const RESPONSIBLE_EMAIL = "tp@tpfiguattorneys.com";
const BATCH = "tpfigu-ob-20260928";
const CUTOVER = new Date("2026-09-28T12:00:00+02:00");
const CURRENCY = "USD";
const SOURCE = "Accounts at 28-09-2026";
const MANIFEST =
  process.env.FIN_IMPORT_MANIFEST ??
  "C:\\Users\\Administrator\\Desktop\\STUFF\\WORK\\Accounts\\Accounts at 28-09-2026\\Opening balance import manifest 28-09-2026.json";

type NewClient = {
  key: string;
  clientType: "individual" | "corporate";
  firstName?: string;
  surname?: string;
  fullName?: string;
  registeredName?: string;
  note: string;
};

/** Existing T Pfigu clients the books refer to (confirmed or firm default choices). */
const EXISTING: Record<string, string> = {
  chikwamaR: "CL0031",
  mundawarara: "CL0028",
  mafuka: "CL0049",
  nyanyiwa: "CL0033",
  jeffery: "CL0050",
  kasipo: "CL0040",
  zokwa: "CL0060",
  pfukwa: "CL0029",
  chiomberegwa: "CL0061",
  chirima: "CL0030",
  maradze: "CL0062",
  mhaka: "CL0054",
  ndagurwa: "CL0034",
  nyabadza: "CL0027",
  matemezano: "CL0019",
  mupetesi: "CL0006",
  gumbo: "CL0053",
  rodrigues: "CL0057",
  dandajena: "CL0043",
  taguta: "CL0020",
};

const NEW_CLIENTS: NewClient[] = [
  { key: "chikwamaM", clientType: "individual", firstName: "M", surname: "Chikwama", note: "Books: Chikwama M (trust bank). Kept separate from CL0031 Rickson Chikwama." },
  { key: "bristow", clientType: "individual", surname: "Bristow", note: "Books: Bristow (trust bank, cost advance)." },
  { key: "chikandiwa", clientType: "individual", surname: "Chikandiwa", note: "Books: Chikandiwa (trust bank)." },
  { key: "chigariro", clientType: "individual", surname: "Chigariro", note: "Books: Chigariro (cash trust)." },
  { key: "paradza", clientType: "individual", surname: "Paradza", note: "Books: Paradza (cash trust)." },
  { key: "gweme", clientType: "individual", surname: "Gweme", note: "Books: Gweme (cash trust)." },
  { key: "harishri", clientType: "corporate", registeredName: "Harishri Africa", note: "Books: Scholtz - Harishi Africa (debtor). Pre-cutover cost advance of 284 written off (firm decision 29 Sep 2026)." },
  { key: "danet", clientType: "corporate", registeredName: "Danet", note: "Books: Danet Harare, DANET Maronderan (TR), Danet Consolidated invoice (TP), Rev Musindo Danet (TP). One client, several matters (firm decision 29 Sep 2026)." },
  { key: "chipanga", clientType: "individual", firstName: "Z", surname: "Chipanga-Mlambo", note: "Books: Z Chipanga-Mlambo (debtor)." },
  { key: "mutanga", clientType: "individual", firstName: "B M", surname: "Mutanga", note: "Books: Mr B M Mutanga (debtor)." },
  { key: "mandizha", clientType: "individual", fullName: "Estate Late Mandizha", note: "Books: Estate Late Mandizha (debtor). Not linked to CL0051 or CL0052." },
  { key: "mwasoya", clientType: "individual", surname: "Mwasoya", note: "Books: Mr Mwasoya (debtor)." },
  { key: "chidziva", clientType: "individual", surname: "Chidziva", note: "Books: Mr Chidziva (debtor)." },
  { key: "kauraro", clientType: "individual", firstName: "W P", surname: "Kauraro", note: "Books: Mr W P Kauraro (debtor)." },
  { key: "kahembe", clientType: "individual", surname: "Kahembe", note: "Books: Kahembe (cost advance)." },
  { key: "granola", clientType: "individual", surname: "Granola", note: "Books: Granola (cost advance)." },
];

/** Bank - Trust Accounts 2026.xlsx, Trust Balances; Zokwa and Pfukwa include the cash deposited on 29 Sep 2026. */
const TRUST_BANK: [string, number, string][] = [
  ["chikwamaR", 4645, "Chikwama R"],
  ["bristow", 7570, "Bristow"],
  ["mundawarara", 650, "Mundawarara"],
  ["chikandiwa", 2689, "Chikandiwa"],
  ["chikwamaM", 24100, "Chikwama M"],
  ["mafuka", 54000, "Mr Mafuka"],
  ["nyanyiwa", 93000, "Mrs H Nyanyiwa"],
  ["jeffery", 2000, "Mr Malcom Jeffery"],
  ["zokwa", 740, "Zokwa: deposited from cash trust (firm decision 29 Sep 2026)"],
  ["pfukwa", 110, "Pfukwa: deposited from cash trust (firm decision 29 Sep 2026)"],
];

/** Disbursement Account Ledger, Cash Trust Account Balances, after the deposit. Totals 534 cash on hand. */
const TRUST_CASH: [string, number, string][] = [
  ["kasipo", 3, "Kasipo"],
  ["chigariro", 179, "Chigariro"],
  ["pfukwa", 83, "Pfukwa"],
  ["paradza", 237, "Paradza"],
  ["chiomberegwa", 10, "Chiomberegwa"],
  ["gweme", 22, "Gweme"],
];

/** Debtors Recon Statements 2026, Master Schedule. [client, amount, name in books, ageing bucket, matter title] */
const DEBTORS: [string, number, string, string, string?][] = [
  ["harishri", 1110, "Scholtz - Harishi Africa", "CURRENT 0-7 DAYS"],
  ["chirima", 650, "Mr K. Chirima", "7-30 DAYS DUE"],
  ["maradze", 800, "T Maradze", "31-60 DAYS DUE"],
  ["danet", 850, "Danet Harare", "31-60 DAYS DUE", "Danet Harare"],
  ["mhaka", 1310, "Ms Mhaka", "31-60 DAYS DUE"],
  ["chipanga", 900, "Z Chipanga-Mlambo", "61-90 DAYS DUE"],
  ["mutanga", 400, "Mr B M Mutanga", "61-90 DAYS DUE"],
  ["mandizha", 1270, "Estate Late Mandizha", "61-90 DAYS DUE"],
  ["ndagurwa", 650, "Ms F Ndagurwa", "61-90 DAYS DUE"],
  ["danet", 970, "DANET Maronderan (TR)", "61-90 DAYS DUE", "Danet Maronderan (TR)"],
  ["nyabadza", 2380, "Mr B Nyabadza", "61-90 DAYS DUE"],
  ["mwasoya", 500, "Mr Mwasoya", "61-90 DAYS DUE"],
  ["danet", 3080, "Danet Consolidated invoice (TP)", "61-90 DAYS DUE", "Danet Consolidated invoice (TP)"],
  ["matemezano", 250, "Monagan P/L Dr Matemezano", "61-90 DAYS DUE"],
  ["mupetesi", 200, "Varaidzo Mupetesi", "61-90 DAYS DUE"],
  ["danet", 5200, "Rev Musindo Danet (TP)", "61-90 DAYS DUE", "Rev Musindo (TP)"],
  ["gumbo", 2520, "Fortunate Gumbo", "90+ DAYS DUE"],
  ["chidziva", 450, "Mr Chidziva", "90+ DAYS DUE"],
  ["kauraro", 7380, "Mr W P Kauraro", "90+ DAYS DUE"],
  ["rodrigues", 3660, "Ms V Rodrigues", "90+ DAYS DUE"],
  ["dandajena", 2335, "Ms S Dandajena", "90+ DAYS DUE"],
];

/** Pot costs paid for clients before cutover, held as recoverable (Mupetesi confirmed; the rest by default). */
const ADVANCES: [string, number, string, boolean][] = [
  ["mupetesi", 51, "Mupetesi", true],
  ["jeffery", 323, "Mr Malcom Jeffery", false],
  ["bristow", 190, "Bristow", false],
  ["taguta", 30, "Taguta", false],
  ["kahembe", 10, "Kahembe", false],
  ["granola", 10, "Granola", false],
  ["danet", 5, "Danet", false],
];

const BUSINESS_CASH = 10;
const EXPECTED = { trustBank: 189504, trustCash: 534, debtors: 36865, advances: 619, businessCash: 10 };

const BUCKET_DAYS: Record<string, number> = {
  "CURRENT 0-7 DAYS": 0,
  "7-30 DAYS DUE": 7,
  "31-60 DAYS DUE": 31,
  "61-90 DAYS DUE": 61,
  "90+ DAYS DUE": 91,
};

type Manifest = {
  batch: string;
  committedAt: string;
  firmId: string;
  clients: string[];
  matters: string[];
  trustAccounts: string[];
  trustEntries: string[];
  invoices: string[];
  disbursements: string[];
  journals: string[];
};

const cents = (n: number) => Math.round(n * 100);
const sum = (xs: [string, number, ...unknown[]][]) => xs.reduce((a, x) => a + x[1], 0);

class DryRunRollback extends Error {}

async function importAll(commit: boolean) {
  const { getDb, runInTransaction } = await import("@/lib/db");
  const s = await import("@/lib/db/schema");
  const { and, eq, sql, inArray } = await import("drizzle-orm");
  const { allocateClientNumber } = await import("@/lib/clients/client-number");
  const { allocateMatterNumber } = await import("@/lib/repos/firm-settings");
  const { postTrustLedgerEntry } = await import("@/lib/repos/trust");
  const { postInvoiceSentGl } = await import("@/lib/gl/posting-invoices");
  const { ensureCoaSeeded, ensureGlAccountByCode } = await import("@/lib/gl/accounts");
  const { postManualJournal } = await import("@/lib/gl/journals");
  const { runFinanceIntegrity } = await import("@/lib/finance/integrity");

  for (const [label, got, want] of [
    ["trust bank", sum(TRUST_BANK), EXPECTED.trustBank],
    ["trust cash", sum(TRUST_CASH), EXPECTED.trustCash],
    ["debtors", sum(DEBTORS), EXPECTED.debtors],
    ["advances", sum(ADVANCES), EXPECTED.advances],
  ] as const) {
    if (got !== want) throw new Error(`${label} lines add to ${got}, expected ${want} from the dry run.`);
  }

  const db = getDb();
  const [firm] = await db.select().from(s.firms).where(eq(s.firms.id, FIRM_ID)).limit(1);
  if (!firm || !/^T Pfigu/i.test(firm.name)) throw new Error("T Pfigu firm not found.");
  const people = await db
    .select({ id: s.users.id, email: s.users.email })
    .from(s.users)
    .where(and(eq(s.users.firmId, FIRM_ID), inArray(s.users.email, [IMPORTER_EMAIL, RESPONSIBLE_EMAIL])));
  const importer = people.find((p) => p.email === IMPORTER_EMAIL)?.id;
  const responsible = people.find((p) => p.email === RESPONSIBLE_EMAIL)?.id;
  if (!importer || !responsible) throw new Error("Importer or responsible Managing Partner not found in T Pfigu.");

  const [existing] = (await db.execute(sql`
    select
      (select count(*)::int from trust_ledger_entries where firm_id = ${FIRM_ID}) as trust_entries,
      (select count(*)::int from trust_accounts where firm_id = ${FIRM_ID}) as trust_accounts,
      (select count(*)::int from invoices where firm_id = ${FIRM_ID}) as invoices,
      (select count(*)::int from disbursements where firm_id = ${FIRM_ID}) as disbursements,
      (select count(*)::int from gl_journal_entries where firm_id = ${FIRM_ID}) as journals`)) as unknown as Record<string, number>[];
  if (Object.values(existing ?? {}).some((n) => Number(n) > 0)) {
    throw new Error(`T Pfigu already has finance rows ${JSON.stringify(existing)}. Refusing to import on top.`);
  }

  const manifest: Manifest = {
    batch: BATCH,
    committedAt: "",
    firmId: FIRM_ID,
    clients: [],
    matters: [],
    trustAccounts: [],
    trustEntries: [],
    invoices: [],
    disbursements: [],
    journals: [],
  };

  const report = await runInTransaction(async () => {
    const tx = getDb();
    await ensureCoaSeeded(FIRM_ID);
    const equity = await ensureGlAccountByCode(FIRM_ID, "3010");
    const advancesGl = await ensureGlAccountByCode(FIRM_ID, "1320");
    const vaultGl = await ensureGlAccountByCode(FIRM_ID, "1020");

    const clientIds = new Map<string, string>();
    const byNumber = await tx
      .select({ id: s.clients.id, clientNumber: s.clients.clientNumber })
      .from(s.clients)
      .where(and(eq(s.clients.firmId, FIRM_ID), inArray(s.clients.clientNumber, Object.values(EXISTING))));
    for (const [key, number] of Object.entries(EXISTING)) {
      const hit = byNumber.find((c) => c.clientNumber === number);
      if (!hit) throw new Error(`Existing client ${number} (${key}) not found.`);
      clientIds.set(key, hit.id);
    }

    for (const c of NEW_CLIENTS) {
      const clientNumber = await allocateClientNumber(FIRM_ID);
      const [row] = await tx
        .insert(s.clients)
        .values({
          firmId: FIRM_ID,
          clientNumber,
          clientType: c.clientType,
          firstName: c.firstName ?? null,
          surname: c.surname ?? null,
          fullName:
            c.fullName ?? c.registeredName ?? ([c.firstName, c.surname].filter(Boolean).join(" ") || null),
          registeredName: c.registeredName ?? null,
          legalName: c.registeredName ?? null,
          responsibleLawyerId: responsible,
          kycStatus: "draft",
          kycNotes: `Created by opening balance import (${BATCH}, ${SOURCE}). ${c.note} KYC details to be completed.`,
          createdBy: importer,
        })
        .returning({ id: s.clients.id });
      clientIds.set(c.key, row!.id);
      manifest.clients.push(row!.id);
    }
    const client = (key: string) => {
      const id = clientIds.get(key);
      if (!id) throw new Error(`No client for ${key}`);
      return id;
    };

    const matterCache = new Map<string, string>();
    async function matterFor(key: string, title?: string) {
      const t = title ?? "Opening balance brought forward (28 Sep 2026)";
      const cacheKey = `${key}:${t}`;
      const hit = matterCache.get(cacheKey);
      if (hit) return hit;
      const matterNumber = await allocateMatterNumber(FIRM_ID);
      const [row] = await tx
        .insert(s.matters)
        .values({
          firmId: FIRM_ID,
          clientId: client(key),
          title: t,
          description: `Holds balances carried over from the firm's books at cutover 28 Sep 2026 (${BATCH}).`,
          areaOfLaw: key === "mandizha" ? "Estates & Trusts" : "Civil",
          status: "open",
          matterNumber,
          responsibleLawyerId: responsible,
          openedAt: CUTOVER,
          createdBy: importer,
        })
        .returning({ id: s.matters.id });
      await tx
        .insert(s.matterTeam)
        .values({ firmId: FIRM_ID, matterId: row!.id, userId: responsible!, roleOnMatter: "responsible_lawyer" })
        .onConflictDoNothing();
      matterCache.set(cacheKey, row!.id);
      manifest.matters.push(row!.id);
      return row!.id;
    }

    const accounts: Record<"bank" | "vault", string> = { bank: "", vault: "" };
    for (const [kind, name] of [
      ["bank", "Trust Bank"],
      ["vault", "Trust Cash"],
    ] as const) {
      const [row] = await tx
        .insert(s.trustAccounts)
        .values({ firmId: FIRM_ID, name, currency: CURRENCY, accountKind: kind, isActive: true })
        .returning({ id: s.trustAccounts.id });
      accounts[kind] = row!.id;
      manifest.trustAccounts.push(row!.id);
    }

    for (const [kind, lines] of [
      ["bank", TRUST_BANK],
      ["vault", TRUST_CASH],
    ] as const) {
      for (const [key, amount, label] of lines) {
        const res = await postTrustLedgerEntry(FIRM_ID, importer!, {
          trustAccountId: accounts[kind],
          matterId: null,
          clientId: client(key),
          entryType: "receipt",
          amountCents: cents(amount),
          currency: CURRENCY,
          occurredAt: CUTOVER,
          reference: null,
          referenceNumber: null,
          narrative: `Opening balance at 28 Sep 2026: ${label}`,
          transferToAccountId: null,
          adjustmentCredit: true,
          allowNegative: false,
          idempotencyKey: `${BATCH}:trust:${kind}:${key}`,
          sourceType: "opening_balance",
          sourceId: BATCH,
        });
        manifest.trustEntries.push(...res.entries.map((e) => e.id));
      }
    }

    let n = 0;
    for (const [key, amount, bookName, bucket, matterTitle] of DEBTORS) {
      n += 1;
      const matterId = await matterFor(key, matterTitle);
      const due = new Date(CUTOVER.getTime() - (BUCKET_DAYS[bucket] ?? 0) * 86_400_000);
      const invoiceNumber = `OB-${String(n).padStart(4, "0")}`;
      const [inv] = await tx
        .insert(s.invoices)
        .values({
          firmId: FIRM_ID,
          matterId,
          clientId: client(key),
          invoiceNumber,
          status: "sent",
          approvalState: "approved",
          approvedAt: new Date(),
          approvedBy: importer,
          currency: CURRENCY,
          issueDate: CUTOVER,
          dueDate: due,
          subtotalCents: cents(amount),
          totalCents: cents(amount),
          notes: `Opening balance per Debtors Recon Statements 2026 (${bucket}). Books name: ${bookName}. Import ${BATCH}.`,
          subject: "Balance brought forward",
          createdBy: importer,
        })
        .returning({ id: s.invoices.id });
      await tx.insert(s.invoiceLines).values({
        firmId: FIRM_ID,
        invoiceId: inv!.id,
        lineType: "fee",
        description: `Fees outstanding brought forward at 28 Sep 2026 (${bucket})`,
        workDate: CUTOVER,
        quantity: 1,
        unitAmountCents: cents(amount),
        amountCents: cents(amount),
        revenueGlAccountId: equity.id,
      });
      const j = await postInvoiceSentGl(FIRM_ID, importer!, inv!.id);
      manifest.invoices.push(inv!.id);
      if (j?.id) manifest.journals.push(j.id);
    }

    for (const [key, amount, name, confirmed] of ADVANCES) {
      const matterId = await matterFor(key);
      const [d] = await tx
        .insert(s.disbursements)
        .values({
          firmId: FIRM_ID,
          matterId,
          description: `Cost advanced before 28 Sep 2026 (${name})${confirmed ? "" : ", recoverable pending firm confirmation"}`,
          amountCents: cents(amount),
          currency: CURRENCY,
          incurredAt: CUTOVER,
          billable: true,
          paidFrom: "operating",
          createdBy: importer,
        })
        .returning({ id: s.disbursements.id });
      const j = await postManualJournal(
        FIRM_ID,
        importer!,
        {
          entryDate: CUTOVER,
          reference: "Opening advance",
          memo: `Opening balance: client cost advance ${name} (${BATCH})`,
          lines: [
            { accountId: advancesGl.id, debitCents: cents(amount), creditCents: 0, matterId, clientId: client(key), currency: CURRENCY },
            { accountId: equity.id, debitCents: 0, creditCents: cents(amount), matterId, clientId: client(key), currency: CURRENCY },
          ],
        },
        "expense",
        `disb-${d!.id}`,
      );
      await tx.update(s.disbursements).set({ glPostedAt: new Date() }).where(eq(s.disbursements.id, d!.id));
      manifest.disbursements.push(d!.id);
      manifest.journals.push(j.id);
    }

    const cash = await postManualJournal(
      FIRM_ID,
      importer!,
      {
        entryDate: CUTOVER,
        reference: "Opening cash",
        memo: `Opening balance: business cash book at 28 Sep 2026 (${BATCH})`,
        lines: [
          { accountId: vaultGl.id, debitCents: cents(BUSINESS_CASH), creditCents: 0, currency: CURRENCY },
          { accountId: equity.id, debitCents: 0, creditCents: cents(BUSINESS_CASH), currency: CURRENCY },
        ],
      },
      "opening",
      `${BATCH}:business_cash`,
    );
    manifest.journals.push(cash.id);

    const integrity = await runFinanceIntegrity(FIRM_ID);
    const [tb] = (await tx.execute(sql`
      select
        (select coalesce(sum(amount_cents),0)::bigint from trust_ledger_entries where trust_account_id = ${accounts.bank}) as trust_bank,
        (select coalesce(sum(amount_cents),0)::bigint from trust_ledger_entries where trust_account_id = ${accounts.vault}) as trust_cash,
        (select coalesce(sum(total_cents),0)::bigint from invoices where firm_id = ${FIRM_ID}) as debtors,
        (select coalesce(sum(amount_cents),0)::bigint from disbursements where firm_id = ${FIRM_ID}) as advances`)) as unknown as Record<string, string>[];
    const gl = (await tx.execute(sql`
      select a.code, (sum(l.debit_cents) - sum(l.credit_cents))::bigint as net
      from gl_journal_lines l join gl_accounts a on a.id = l.account_id
      where l.firm_id = ${FIRM_ID} group by a.code order by a.code`)) as unknown as { code: string; net: string }[];

    const totals = {
      trustBank: Number(tb!.trust_bank) / 100,
      trustCash: Number(tb!.trust_cash) / 100,
      debtors: Number(tb!.debtors) / 100,
      advances: Number(tb!.advances) / 100,
    };
    const mismatch =
      totals.trustBank !== EXPECTED.trustBank ||
      totals.trustCash !== EXPECTED.trustCash ||
      totals.debtors !== EXPECTED.debtors ||
      totals.advances !== EXPECTED.advances;
    const result = {
      mode: commit ? "commit" : "dry_run",
      totals,
      gl: Object.fromEntries(gl.map((r) => [r.code, Number(r.net) / 100])),
      created: Object.fromEntries(Object.entries(manifest).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, (v as string[]).length])),
      integrity: integrity.checks.map((c) => `${c.ok ? "OK  " : "FAIL"} ${c.id}: ${c.detail}`),
      integrityOk: integrity.ok,
    };
    if (!integrity.ok || mismatch) {
      console.log(JSON.stringify(result, null, 2));
      throw new Error("Integrity or totals check failed. Nothing was saved.");
    }
    if (!commit) {
      console.log(JSON.stringify(result, null, 2));
      throw new DryRunRollback("Dry run complete. Rolled back; nothing was saved.");
    }
    return result;
  });

  manifest.committedAt = new Date().toISOString();
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(`Committed. Manifest: ${MANIFEST}`);
}

async function rollback(path: string) {
  const { getDb, runInTransaction } = await import("@/lib/db");
  const { sql } = await import("drizzle-orm");
  const m = JSON.parse(readFileSync(path, "utf8")) as Manifest;
  if (m.batch !== BATCH || m.firmId !== FIRM_ID) throw new Error("Manifest is not for this batch.");
  const ids = (xs: string[]) => sql.join(xs.length ? xs.map((x) => sql`${x}::uuid`) : [sql`null::uuid`], sql`, `);

  await runInTransaction(async () => {
    const db = getDb();
    const [later] = (await db.execute(sql`
      select
        (select count(*)::int from trust_ledger_entries where firm_id = ${FIRM_ID} and id not in (${ids(m.trustEntries)})) as trust,
        (select count(*)::int from invoices where firm_id = ${FIRM_ID} and id not in (${ids(m.invoices)})) as invoices,
        (select count(*)::int from fee_payments where firm_id = ${FIRM_ID}) as receipts,
        (select count(*)::int from disbursements where firm_id = ${FIRM_ID} and id not in (${ids(m.disbursements)})) as disbursements,
        (select count(*)::int from gl_journal_entries j where j.firm_id = ${FIRM_ID}
           and j.id not in (${ids(m.journals)})
           and not (j.source_type = 'trust' and j.source_id in (select id::text from trust_ledger_entries where id in (${ids(m.trustEntries)})))) as journals,
        (select count(*)::int from matters where client_id in (${ids(m.clients)}) and id not in (${ids(m.matters)})) as other_matters`)) as unknown as Record<string, number>[];
    if (Object.values(later ?? {}).some((n) => Number(n) > 0)) {
      throw new Error(`Finance activity exists beyond this import ${JSON.stringify(later)}. Rollback refused; correct with reversals instead.`);
    }
    await db.execute(sql`delete from gl_journal_entries where firm_id = ${FIRM_ID}
      and (id in (${ids(m.journals)}) or (source_type = 'trust' and source_id in (select id::text from trust_ledger_entries where id in (${ids(m.trustEntries)}))))`);
    await db.execute(sql`delete from trust_ledger_entries where firm_id = ${FIRM_ID} and id in (${ids(m.trustEntries)})`);
    await db.execute(sql`delete from disbursements where firm_id = ${FIRM_ID} and id in (${ids(m.disbursements)})`);
    await db.execute(sql`delete from invoices where firm_id = ${FIRM_ID} and id in (${ids(m.invoices)})`);
    await db.execute(sql`delete from trust_accounts where firm_id = ${FIRM_ID} and id in (${ids(m.trustAccounts)})`);
    await db.execute(sql`delete from matters where firm_id = ${FIRM_ID} and id in (${ids(m.matters)})`);
    await db.execute(sql`delete from clients where firm_id = ${FIRM_ID} and id in (${ids(m.clients)})`);
  });
  console.log("Rolled back the opening balance import.");
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--rollback") {
    if (!args[1]) throw new Error("Pass the manifest path.");
    await rollback(args[1]);
  } else {
    await importAll(args.includes("--commit"));
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    if (e instanceof DryRunRollback) {
      console.log(e.message);
      process.exit(0);
    }
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
