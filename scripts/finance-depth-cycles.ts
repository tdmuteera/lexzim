/**
 * Finance depth regression: ten money-movement cycles against a running local server.
 *
 * SAFETY: runs only against the Isolation Test Firm with sandbox users, tags every record
 * it creates with FINQA, and deletes them afterwards. Never point this at a live firm.
 *
 *   FIN_QA_CREDS=<creds.json> npx tsx scripts/finance-depth-cycles.ts
 *
 * creds.json: { firmId, mp: { email, password, id }, accounts: { email, password, id } } for a
 * Managing Partner and an Accounts user in the Isolation Test Firm.
 *
 * Writes a JSON result file (FIN_QA_OUT, default %TEMP%/finance_cycles_result.json).
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- untyped HTTP JSON responses */
import { config } from "dotenv";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

config({ path: ".env.local" });

const BASE = process.env.FIN_QA_BASE ?? "http://localhost:3000";
const SANDBOX_FIRM_NAME = "Isolation Test Firm";
const TAG = "FINQA";
const creds = JSON.parse(
  readFileSync(process.env.FIN_QA_CREDS ?? `${process.env.TEMP}\\fin_sandbox_user.json`, "utf8"),
) as {
  firmId: string;
  mp: { email: string; password: string; id: string };
  accounts: { email: string; password: string; id: string };
};
const OUT = process.env.FIN_QA_OUT ?? `${process.env.TEMP}\\finance_cycles_result.json`;

const sql = postgres(process.env.DIRECT_URL || process.env.DATABASE_URL!, { max: 2, prepare: false });
const FIRM = creds.firmId;

type Res = { status: number; body: any };
type Step = {
  cycle: number;
  step: string;
  expected: string;
  actual: string;
  pass: boolean;
};
const steps: Step[] = [];
const integrityRuns: Array<{ cycle: number; label: string; ok: boolean; failed: unknown[] }> = [];
let currentCycle = 0;

class Session {
  cookies = new Map<string, string>();
  private creds: { email: string; password: string } | null = null;
  constructor(public label: string) {}
  async login(email: string, password: string) {
    this.creds = { email, password };
    const res = await this.send("POST", "/api/auth/login", { email, password });
    if (res.status !== 200) throw new Error(`login failed for ${email}: ${JSON.stringify(res.body)}`);
  }
  /** Staff sessions log out after 30 idle minutes; a long run signs in again once and retries. */
  async call(method: string, path: string, body?: unknown): Promise<Res> {
    const res = await this.send(method, path, body);
    if (res.status === 401 && this.creds) {
      this.cookies.clear();
      await this.login(this.creds.email, this.creds.password);
      return this.send(method, path, body);
    }
    return res;
  }
  private async send(method: string, path: string, body?: unknown): Promise<Res> {
    const headers: Record<string, string> = { Origin: BASE, Referer: `${BASE}/` };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (this.cookies.size) {
      headers.Cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    }
    const r = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    });
    for (const c of r.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const idx = pair!.indexOf("=");
      const k = pair!.slice(0, idx).trim();
      const v = pair!.slice(idx + 1).trim();
      if (v === "" || /max-age=0/i.test(c)) this.cookies.delete(k);
      else this.cookies.set(k, v);
    }
    const text = await r.text();
    let parsed: any = text;
    try {
      parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object" && "ok" in parsed && "data" in parsed && parsed.ok === true) {
        parsed = parsed.data;
      }
    } catch {
      /* binary or html */
    }
    return { status: r.status, body: parsed };
  }
}

const mp = new Session("managing_partner");
const acc = new Session("accounts");

function record(step: string, expected: string, actual: string, pass: boolean) {
  steps.push({ cycle: currentCycle, step, expected, actual, pass });
  console.log(`${pass ? "PASS" : "FAIL"} [C${currentCycle}] ${step} :: ${actual}`);
}

function errText(res: Res) {
  return typeof res.body === "object" && res.body
    ? String(res.body.error?.message ?? res.body.message ?? res.body.error ?? JSON.stringify(res.body)).slice(0, 220)
    : String(res.body).slice(0, 120);
}

function ok(res: Res, step: string, expected = "succeeds") {
  const pass = res.status >= 200 && res.status < 300;
  record(step, expected, pass ? `HTTP ${res.status}` : `HTTP ${res.status}: ${errText(res)}`, pass);
  return res;
}

function rejected(res: Res, step: string, expected: string, statuses = [400, 403, 404, 409, 422]) {
  const pass = statuses.includes(res.status);
  record(step, expected, `HTTP ${res.status}: ${errText(res)}`, pass);
  return res;
}

function eq(step: string, actual: unknown, expected: unknown) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  record(step, String(JSON.stringify(expected)), String(JSON.stringify(actual)), pass);
  return pass;
}

async function integrity(label: string) {
  const res = await mp.call("GET", "/api/finance/integrity");
  const failed = res.status === 200 ? res.body.checks.filter((c: any) => !c.ok) : [{ error: errText(res) }];
  const pass = res.status === 200 && res.body.ok === true;
  integrityRuns.push({ cycle: currentCycle, label, ok: pass, failed });
  record(
    `Integrity: ${label}`,
    "all cross-ledger checks pass",
    pass ? `${res.body.checks.length} checks ok` : failed.map((f: any) => `${f.id}: ${f.detail}`).join("; "),
    pass,
  );
}

async function trustBalance(clientId: string) {
  const res = await mp.call("GET", `/api/trust/clients/${clientId}/statement`);
  return res.status === 200 ? Number(res.body.balanceCents) : NaN;
}

async function invoiceState(invoiceId: string) {
  const res = await mp.call("GET", `/api/invoices/${invoiceId}`);
  return { status: res.body?.invoice?.status, balance: res.body?.invoice?.balanceCents };
}

async function glBalance(code: string) {
  const [row] = await sql`
    select coalesce(sum(l.debit_cents - l.credit_cents),0)::bigint as bal
    from gl_journal_lines l join gl_accounts a on a.id = l.account_id
    where l.firm_id = ${FIRM} and a.code = ${code}`;
  return Number(row?.bal ?? 0);
}

const today = () => new Date().toISOString();

// ---------- setup ----------
const ids: Record<string, string> = {};

async function setup() {
  const [firm] = await sql`select name from firms where id = ${FIRM}`;
  if (!firm || firm.name !== SANDBOX_FIRM_NAME) {
    throw new Error(`Refusing to run: firm ${FIRM} is not the ${SANDBOX_FIRM_NAME}.`);
  }
  for (const u of [creds.mp, creds.accounts]) {
    const [row] = await sql`select is_test_user, firm_id from users where id = ${u.id}`;
    if (!row?.is_test_user || row.firm_id !== FIRM) throw new Error(`Refusing to run: ${u.email} is not a sandbox test user.`);
  }
  await cleanup();

  const clients = [
    ["A", "FINQA Client A (Zokwa pattern)"],
    ["B", "FINQA Client B (Pfukwa pattern)"],
    ["C", "FINQA Client C"],
    ["D", "FINQA Client D (end to end)"],
  ];
  for (const [key, name] of clients) {
    const [c] = await sql`insert into clients (firm_id, client_type, client_number, full_name)
      values (${FIRM}, 'individual', ${`${TAG}-${key}-${Date.now() % 100000}`}, ${name}) returning id`;
    ids[`client${key}`] = c!.id;
  }
  const matters = [
    ["A1", "A", "FINQA A matter 1"],
    ["A2", "A", "FINQA A matter 2"],
    ["B1", "B", "FINQA B matter 1"],
    ["C1", "C", "FINQA C matter 1"],
    ["D1", "D", "FINQA D matter 1"],
  ];
  for (const [key, client, title] of matters) {
    const [m] = await sql`insert into matters (firm_id, client_id, title, area_of_law)
      values (${FIRM}, ${ids[`client${client}`]!}, ${title}, 'General') returning id`;
    ids[`matter${key}`] = m!.id;
  }

  await mp.login(creds.mp.email, creds.mp.password);
  await acc.login(creds.accounts.email, creds.accounts.password);

  const bank = await mp.call("POST", "/api/trust/accounts", {
    name: `${TAG} Trust Bank`,
    currency: "USD",
    accountKind: "bank",
  });
  const vault = await mp.call("POST", "/api/trust/accounts", {
    name: `${TAG} Trust Cash`,
    currency: "USD",
    accountKind: "vault",
  });
  ids.bank = bank.body.account?.id ?? bank.body.item?.id;
  ids.vault = vault.body.account?.id ?? vault.body.item?.id;
  if (!ids.bank || !ids.vault) throw new Error(`trust account setup failed ${JSON.stringify(bank.body)}`);
}

async function makeInvoice(clientKey: string, matterKey: string, cents: number, label: string, send = true) {
  const res = await mp.call("POST", "/api/invoices", {
    clientId: ids[`client${clientKey}`],
    matterId: ids[`matter${matterKey}`],
    subject: `${TAG} ${label}`,
    lines: [{ description: `${TAG} ${label}`, qty: 1, unitPriceCents: cents }],
  });
  const id = res.body?.invoice?.id as string;
  if (!id) {
    record(`Create invoice ${label}`, "created", `HTTP ${res.status}: ${errText(res)}`, false);
    return "";
  }
  if (send) {
    let sent = await mp.call("PATCH", `/api/invoices/${id}`, { status: "sent" });
    if (sent.status !== 200 && /approv/i.test(errText(sent))) {
      await mp.call("POST", `/api/invoices/${id}/approval`, { action: "submit" });
      await mp.call("POST", `/api/invoices/${id}/approval`, { action: "approve" });
      sent = await mp.call("PATCH", `/api/invoices/${id}`, { status: "sent" });
    }
    ok(sent, `Invoice ${label} created and marked sent (${cents / 100})`);
  }
  return id;
}

async function intake(s: Session, body: Record<string, unknown>) {
  return s.call("POST", "/api/finance/payments", { receivedAt: today(), currency: "USD", method: "cash", ...body });
}

async function requisition(s: Session, body: Record<string, unknown>) {
  const res = await s.call("POST", "/api/finance/requisitions", { currency: "USD", submit: true, ...body });
  return res.body?.requisition?.id as string;
}

async function reqAction(s: Session, id: string, body: Record<string, unknown>) {
  return s.call("POST", `/api/finance/requisitions/${id}/action`, body);
}

// ---------- cycles ----------
async function cycle1() {
  currentCycle = 1;
  const inv = await makeInvoice("A", "A1", 50000, "C1 standard invoice");
  ok(
    await mp.call("POST", `/api/invoices/${inv}/payments`, { amountCents: 50000, paidAt: today(), method: "bank" }),
    "Record full payment 500",
  );
  eq("Invoice status after full payment", await invoiceState(inv), { status: "paid", balance: 0 });
  rejected(
    await mp.call("POST", `/api/invoices/${inv}/payments`, { amountCents: 100, paidAt: today() }),
    "Extra payment on a paid invoice",
    "rejected as already fully paid",
  );
  const pdf = await mp.call("GET", `/api/export/invoice?format=pdf&id=${inv}`);
  record("Invoice PDF export", "HTTP 200", `HTTP ${pdf.status}`, pdf.status === 200);
  await integrity("after standard invoice and payment");
  ids.c1Invoice = inv;
}

async function cycle2() {
  currentCycle = 2;
  const inv = await makeInvoice("A", "A1", 100000, "C2 partial");
  const p1 = ok(
    await mp.call("POST", `/api/invoices/${inv}/payments`, { amountCents: 30000, paidAt: today(), method: "cash" }),
    "Partial payment 300",
  );
  eq("Invoice after partial", await invoiceState(inv), { status: "sent", balance: 70000 });
  rejected(
    await mp.call("POST", `/api/invoices/${inv}/payments`, { amountCents: 80000, paidAt: today() }),
    "Overpayment 800 against balance 700",
    "rejected (exceeds balance)",
  );
  ok(
    await mp.call("POST", `/api/invoices/${inv}/payments`, { amountCents: 70000, paidAt: today(), method: "bank" }),
    "Settlement payment 700",
  );
  eq("Invoice after settlement", await invoiceState(inv), { status: "paid", balance: 0 });
  const receipt = await mp.call("GET", `/api/export/receipt?format=pdf&id=${p1.body?.payment?.id}`);
  record("Receipt PDF export", "HTTP 200", `HTTP ${receipt.status}`, receipt.status === 200);
  await integrity("after partial then settlement");
}

async function cycle3() {
  currentCycle = 3;
  const a = ids.clientA!;
  ok(
    await intake(mp, {
      clientId: a,
      matterId: ids.matterA1,
      destination: "trust_bank",
      trustAccountId: ids.bank,
      amountCents: 200000,
      lines: [{ lineType: "trust_hold", amountCents: 200000 }],
    }),
    "Trust deposit 2,000 into trust bank for client A",
  );
  eq("Client A trust balance", await trustBalance(a), 200000);
  await integrity("after trust deposit");

  ok(
    await intake(mp, {
      clientId: a,
      matterId: ids.matterA1,
      destination: "trust_vault",
      trustAccountId: ids.vault,
      amountCents: 30000,
      lines: [{ lineType: "trust_hold", amountCents: 30000 }],
    }),
    "Cash trust deposit 300 into trust cash (vault)",
  );
  ok(
    await mp.call("POST", "/api/trust/vault/bank-in", {
      vaultAccountId: ids.vault,
      bankAccountId: ids.bank,
      clientId: a,
      matterId: ids.matterA1,
      amountCents: 30000,
      occurredAt: today(),
    }),
    "Bank the 300 cash trust into trust bank",
  );
  eq("Client A trust balance after banking (unchanged total)", await trustBalance(a), 230000);

  const inv = await makeInvoice("A", "A1", 40000, "C3 settle from trust");
  const bankBefore = await glBalance("1010");
  ok(await mp.call("POST", `/api/invoices/${inv}/apply-retainer`, { amountCents: 40000 }), "Settle invoice 400 from client A trust");
  eq("Invoice after trust settlement", await invoiceState(inv), { status: "paid", balance: 0 });
  eq("Client A trust after settlement", await trustBalance(a), 190000);
  eq("Operating bank (1010) increased by earned fees", (await glBalance("1010")) - bankBefore, 40000);
  ids.c3Invoice = inv;

  const mixed = ok(
    await intake(mp, {
      clientId: a,
      matterId: ids.matterA1,
      destination: "trust_bank",
      trustAccountId: ids.bank,
      amountCents: 50000,
      lines: [
        { lineType: "trust_hold", amountCents: 10000 },
        { lineType: "fee_revenue", feeCategory: "consultation", amountCents: 40000 },
      ],
    }),
    "Mixed payment 500: 100 held in trust, 400 consultation fees earned from trust",
  );
  ids.c3MixedIntake = mixed.body?.intake?.id;
  eq("Client A trust after mixed payment", await trustBalance(a), 200000);
  await integrity("after trust movements");
}

async function cycle4() {
  currentCycle = 4;
  const a = ids.clientA!;
  const r1 = await requisition(acc, {
    type: "disbursement",
    clientId: a,
    matterId: ids.matterA1,
    description: `${TAG} deeds office search fee`,
    amountCents: 15000,
  });
  record("Create disbursement requisition 150 (accounts user)", "created", r1 ? "created" : "failed", Boolean(r1));
  ok(await reqAction(mp, r1, { action: "approve" }), "Approve requisition");
  const paid = ok(await reqAction(acc, r1, { action: "pay", paidFrom: "trust", paymentRef: "FINQA-R1" }), "Pay requisition from client trust");
  eq("Requisition links to its trust entry", Boolean(paid.body?.requisition?.trustEntryId), true);
  eq("Client A trust after requisition", await trustBalance(a), 185000);
  rejected(await reqAction(acc, r1, { action: "pay", paidFrom: "trust" }), "Pay the same requisition twice", "rejected (only approved can be paid)");
  ids.c4Req = r1;
  await integrity("after trust requisition");

  const b = ids.clientB!;
  ok(
    await intake(mp, {
      clientId: b,
      matterId: ids.matterB1,
      destination: "trust_bank",
      trustAccountId: ids.bank,
      amountCents: 5000,
      lines: [{ lineType: "trust_hold", amountCents: 5000 }],
    }),
    "Client B deposits 50 into trust",
  );
  const r2 = await requisition(acc, {
    type: "disbursement",
    clientId: b,
    matterId: ids.matterB1,
    description: `${TAG} sheriff fees`,
    amountCents: 20000,
  });
  ok(await reqAction(mp, r2, { action: "approve" }), "Approve B requisition 200");
  rejected(await reqAction(acc, r2, { action: "pay", paidFrom: "trust" }), "Pay 200 from trust holding 50", "rejected (insufficient trust)");
  rejected(
    await reqAction(acc, r2, { action: "pay", paidFrom: "trust_then_float" }),
    "Trust then float by accounts user (float part needs MP)",
    "forbidden",
  );
  const split = ok(await reqAction(mp, r2, { action: "pay", paidFrom: "trust_then_float", paymentRef: "FINQA-R2" }), "Trust then float by Managing Partner");
  eq("Split requisition marked recoverable", split.body?.requisition?.recoverable, true);
  eq("Client B trust used first (balance 0)", await trustBalance(b), 0);
  ids.c4ReqSplit = r2;

  const r3 = await requisition(acc, {
    type: "business",
    nature: "9070",
    description: `${TAG} office stationery`,
    amountCents: 8000,
  });
  ok(await reqAction(mp, r3, { action: "approve" }), "Approve business requisition 80");
  ok(await reqAction(acc, r3, { action: "pay", paidFrom: "operating", paymentRef: "FINQA-R3" }), "Pay business requisition from operating");
  ids.c4ReqBusiness = r3;

  rejected(
    await mp.call("POST", `/api/matters/${ids.matterA1}/disbursements`, {
      description: `${TAG} direct trust disbursement`,
      amountCents: 1000,
      incurredAt: today(),
      billable: true,
      paidFrom: "trust",
    }),
    "Matter disbursement marked paid from trust outside a requisition",
    "rejected (must go through requisition)",
  );
  await integrity("after requisitions");
}

async function cycle5() {
  currentCycle = 5;
  const c = ids.clientC!;
  const manual = ok(
    await mp.call("POST", "/api/trust/ledger", {
      trustAccountId: ids.bank,
      clientId: c,
      matterId: ids.matterC1,
      entryType: "receipt",
      amountCents: 50000,
      occurredAt: today(),
      narrative: `${TAG} keyed in error`,
    }),
    "Manual trust receipt 500 for client C",
  );
  const entryId = manual.body?.entries?.[0]?.id;
  rejected(await mp.call("POST", `/api/trust/ledger/${entryId}/reverse`, {}), "Reverse without a reason", "rejected (reason required)");
  const rev = ok(await mp.call("POST", `/api/trust/ledger/${entryId}/reverse`, { reason: "Keyed to wrong client" }), "Reverse manual receipt with reason");
  eq("Reversal row links to original", rev.body?.reversals?.[0]?.reversalOfId, entryId);
  eq("Client C trust after reversal", await trustBalance(c), 0);
  rejected(await mp.call("POST", `/api/trust/ledger/${entryId}/reverse`, { reason: "again" }), "Reverse the same entry twice", "rejected (already reversed)");

  const inv = await makeInvoice("C", "C1", 30000, "C5 receipt reversal");
  const pay = ok(await mp.call("POST", `/api/invoices/${inv}/payments`, { amountCents: 30000, paidAt: today(), method: "cheque" }), "Pay invoice 300 by cheque");
  rejected(await mp.call("PATCH", `/api/invoices/${inv}`, { status: "void" }), "Void an invoice that has a receipt", "rejected (reverse receipts first)");
  const prev = ok(
    await mp.call("POST", `/api/invoices/${inv}/payments/${pay.body?.payment?.id}/reverse`, { reason: "Cheque bounced" }),
    "Reverse the receipt (cheque bounced)",
  );
  eq("Invoice reopens after receipt reversal", await invoiceState(inv), { status: "sent", balance: 30000 });
  eq("Contra receipt number", prev.body?.reversal?.receiptNumber?.endsWith("-REV"), true);
  ok(await mp.call("PATCH", `/api/invoices/${inv}`, { status: "void" }), "Void invoice after the receipt is reversed");

  const [feeEntry] = await sql`select id from trust_ledger_entries where firm_id = ${FIRM} and invoice_id = ${ids.c3Invoice!} and source_type = 'invoice_fee'`;
  ok(await mp.call("POST", `/api/trust/ledger/${feeEntry!.id}/reverse`, { reason: "Fee applied to wrong invoice" }), "Reverse fee taken from trust");
  eq("Invoice reopens after trust fee reversal", await invoiceState(ids.c3Invoice!), { status: "sent", balance: 40000 });
  eq("Client A trust restored by 400", await trustBalance(ids.clientA!), 225000);

  ok(await mp.call("POST", `/api/finance/payments/${ids.c3MixedIntake}/reverse`, { reason: "Duplicate capture" }), "Reverse the mixed payment intake");
  eq("Client A trust after intake reversal (hold 100 removed, fee 400 restored then removed)", await trustBalance(ids.clientA!), 215000);
  rejected(await mp.call("POST", `/api/finance/payments/${ids.c3MixedIntake}/reverse`, { reason: "again" }), "Reverse the same intake twice", "rejected");

  rejected(await reqAction(acc, ids.c4Req!, { action: "reverse_payment", reason: "Refunded" }), "Accounts user reverses a paid requisition", "forbidden (MP only)");
  const rr = ok(await reqAction(mp, ids.c4Req!, { action: "reverse_payment", reason: "Deeds office refunded" }), "MP reverses paid requisition");
  eq("Requisition status", rr.body?.requisition?.status, "reversed");
  eq("Client A trust after requisition reversal", await trustBalance(ids.clientA!), 230000);
  await integrity("after reversals and corrections");
}

async function cycle6() {
  currentCycle = 6;
  const i1 = await makeInvoice("A", "A2", 20000, "C6 inv1");
  const i2 = await makeInvoice("A", "A2", 30000, "C6 inv2");
  const i3 = await makeInvoice("A", "A2", 50000, "C6 inv3");
  const before = await sql`select count(*)::int c from finance_payment_intakes where firm_id = ${FIRM}`;
  rejected(
    await intake(mp, {
      clientId: ids.clientA,
      matterId: ids.matterA2,
      destination: "fee_bank",
      amountCents: 80000,
      lines: [
        { lineType: "fee_revenue", feeCategory: "drafting", amountCents: 30000, invoiceId: i1 },
        { lineType: "fee_revenue", feeCategory: "drafting", amountCents: 50000, invoiceId: i3 },
      ],
    }),
    "Payment allocating 300 to a 200 invoice",
    "rejected before anything posts",
  );
  const after = await sql`select count(*)::int c from finance_payment_intakes where firm_id = ${FIRM}`;
  eq("No partial intake left behind", after[0]!.c, before[0]!.c);
  const multi = ok(
    await intake(mp, {
      clientId: ids.clientA,
      matterId: ids.matterA2,
      destination: "fee_bank",
      amountCents: 70000,
      lines: [
        { lineType: "fee_revenue", feeCategory: "drafting", amountCents: 20000, invoiceId: i1 },
        { lineType: "fee_revenue", feeCategory: "drafting", amountCents: 30000, invoiceId: i2 },
        { lineType: "fee_revenue", feeCategory: "drafting", amountCents: 20000, invoiceId: i3 },
      ],
    }),
    "One payment of 700 split over three invoices",
  );
  eq("Invoice 1", await invoiceState(i1), { status: "paid", balance: 0 });
  eq("Invoice 2", await invoiceState(i2), { status: "paid", balance: 0 });
  eq("Invoice 3 (partly paid)", await invoiceState(i3), { status: "sent", balance: 30000 });
  const receipts = await sql`select receipt_number from fee_payments where intake_id = ${multi.body?.intake?.id} order by receipt_number`;
  eq("Three distinct receipt numbers", new Set(receipts.map((r) => r.receipt_number)).size, 3);
  ok(await mp.call("POST", `/api/invoices/${i3}/payments`, { amountCents: 30000, paidAt: today() }), "Second payment settles invoice 3");
  eq("Invoice 3 settled", await invoiceState(i3), { status: "paid", balance: 0 });
  await integrity("after multiple invoices and payments");
}

async function cycle7() {
  currentCycle = 7;
  const a = ids.clientA!;
  ok(
    await intake(mp, {
      clientId: a,
      matterId: ids.matterA2,
      destination: "trust_bank",
      trustAccountId: ids.bank,
      amountCents: 60000,
      lines: [{ lineType: "trust_hold", amountCents: 60000 }],
    }),
    "Client A deposits 600 on matter A2",
  );
  const [a2] = await sql`select coalesce(sum(amount_cents),0)::int s from trust_ledger_entries where client_id = ${a} and matter_id = ${ids.matterA2!}`;
  eq("Matter A2 trust balance", a2!.s, 60000);
  rejected(
    await mp.call("POST", "/api/trust/ledger", {
      trustAccountId: ids.bank,
      clientId: a,
      matterId: ids.matterB1,
      entryType: "receipt",
      amountCents: 1000,
      occurredAt: today(),
    }),
    "Trust receipt for client A on client B's matter",
    "rejected (matter belongs to another client)",
  );
  const inv = await makeInvoice("A", "A1", 10000, "C7 other matter");
  ok(await mp.call("POST", `/api/invoices/${inv}/apply-retainer`, { amountCents: 10000 }), "Settle A1 invoice from client A trust (client level)");
  const stmt = await mp.call("GET", `/api/trust/clients/${a}/statement`);
  record("Client statement lists matters", "lines carry matter titles", `${stmt.body?.lines?.length} lines`, stmt.status === 200);
  await integrity("after multiple matters");
}

async function cycle8() {
  currentCycle = 8;
  const a = ids.clientA!;
  const b = ids.clientB!;
  const invA = await makeInvoice("A", "A1", 5000, "C8 A invoice");
  rejected(
    await intake(mp, {
      clientId: b,
      destination: "fee_bank",
      amountCents: 5000,
      lines: [{ lineType: "fee_revenue", feeCategory: "other_fee", amountCents: 5000, invoiceId: invA }],
    }),
    "Client B payment allocated to client A invoice",
    "rejected (different client)",
  );
  const invB = await makeInvoice("B", "B1", 20000, "C8 B invoice");
  rejected(
    await mp.call("POST", `/api/invoices/${invB}/apply-retainer`, { amountCents: 20000 }),
    "Settle B invoice from trust while only A has funds",
    "rejected (never uses another client's money)",
  );
  const aBefore = await trustBalance(a);
  const xfer = {
    trustAccountId: ids.bank,
    fromClientId: a,
    toClientId: b,
    toMatterId: ids.matterB1,
    amountCents: 10000,
  };
  rejected(await acc.call("POST", "/api/trust/client-transfer", { ...xfer, reason: "instruction" }), "Accounts user moves A money to B", "forbidden");
  rejected(await mp.call("POST", "/api/trust/client-transfer", xfer), "MP transfer without written instruction", "rejected (reason required)");
  rejected(
    await mp.call("POST", "/api/trust/client-transfer", { ...xfer, amountCents: 99999999, reason: "instruction" }),
    "MP transfer above A's balance",
    "rejected (insufficient)",
  );
  const t = ok(
    await mp.call("POST", "/api/trust/client-transfer", { ...xfer, reason: "Client A written instruction dated today to fund client B" }),
    "MP transfer 100 from A to B with instruction",
  );
  eq("A reduced by 100", (await trustBalance(a)) - aBefore, -10000);
  eq("B received 100", await trustBalance(b), 10000);
  eq("Both legs name the counterparty", t.body?.entries?.map((e: any) => Boolean(e.counterpartyClientId)), [true, true]);
  ok(await mp.call("POST", `/api/trust/ledger/${t.body?.entries?.[0]?.id}/reverse`, { reason: "Instruction withdrawn" }), "Reverse the client transfer");
  eq("B back to 0 after reversal", await trustBalance(b), 0);
  await integrity("after segregation tests");
}

async function cycle9() {
  currentCycle = 9;
  const c = ids.clientC!;
  ok(
    await mp.call("POST", "/api/trust/ledger", {
      trustAccountId: ids.bank,
      clientId: c,
      entryType: "receipt",
      amountCents: 10000,
      occurredAt: today(),
      idempotencyKey: `${TAG}-idem-1`,
    }),
    "Trust receipt 100 with idempotency key",
  );
  const replay = await mp.call("POST", "/api/trust/ledger", {
    trustAccountId: ids.bank,
    clientId: c,
    entryType: "receipt",
    amountCents: 10000,
    occurredAt: today(),
    idempotencyKey: `${TAG}-idem-1`,
  });
  eq("Replay of same key is not posted twice", replay.body?.replayed, true);
  eq("Client C trust after replay", await trustBalance(c), 10000);

  const disb = (extra: Record<string, unknown>, s: Session = mp) =>
    s.call("POST", "/api/trust/ledger", {
      trustAccountId: ids.bank,
      clientId: c,
      entryType: "disbursement",
      amountCents: 15000,
      occurredAt: today(),
      ...extra,
    });
  rejected(await disb({}), "Trust payment 150 against 100", "rejected (insufficient)");
  rejected(await disb({ allowNegative: true, overrideReason: "urgent" }, acc), "Overdraw by accounts user", "forbidden");
  rejected(await disb({ allowNegative: true }), "Overdraw by MP without reason", "rejected (reason required)");
  const od = ok(await disb({ allowNegative: true, overrideReason: "Urgent court filing, client paying tomorrow" }), "Overdraw by MP with reason (recorded)");
  eq("Override records who authorised", od.body?.entries?.[0]?.authorisedBy, creds.mp.id);
  await integrity("with an authorised overdraw");
  ok(await mp.call("POST", `/api/trust/ledger/${od.body?.entries?.[0]?.id}/reverse`, { reason: "Filing cancelled" }), "Reverse the overdraw");

  const par = await Promise.all(
    [1, 2, 3, 4, 5].map(() =>
      mp.call("POST", "/api/trust/ledger", {
        trustAccountId: ids.bank,
        clientId: c,
        entryType: "disbursement",
        amountCents: 4000,
        occurredAt: today(),
      }),
    ),
  );
  const succeeded = par.filter((r) => r.status === 201).length;
  eq("Five simultaneous 40 payments from 100: only two succeed", succeeded, 2);
  eq("Client C never negative", (await trustBalance(c)) >= 0, true);

  rejected(
    await mp.call("POST", "/api/trust/ledger", { trustAccountId: ids.bank, clientId: c, entryType: "receipt", amountCents: 0, occurredAt: today() }),
    "Zero amount",
    "rejected",
  );
  rejected(
    await mp.call("POST", "/api/trust/ledger", { trustAccountId: ids.bank, clientId: c, entryType: "receipt", amountCents: 100, currency: "ZWG", occurredAt: today() }),
    "Currency differs from trust account",
    "rejected",
  );
  rejected(
    await mp.call("POST", "/api/trust/ledger", { trustAccountId: ids.bank, entryType: "transfer", transferToAccountId: ids.vault, amountCents: 100, occurredAt: today() }),
    "Trust transfer with no client",
    "rejected (client required)",
  );
  rejected(
    await mp.call("POST", "/api/trust/ledger", { trustAccountId: ids.bank, clientId: randomUUID(), entryType: "receipt", amountCents: 100, occurredAt: today() }),
    "Unknown client",
    "rejected",
  );
  const inv = await makeInvoice("C", "C1", 12000, "C9 mark paid");
  rejected(await mp.call("PATCH", `/api/invoices/${inv}`, { status: "paid" }), "Mark invoice paid with no money received", "rejected");

  const r = await requisition(acc, { type: "disbursement", clientId: c, matterId: ids.matterC1, description: `${TAG} race`, amountCents: 1000 });
  await reqAction(mp, r, { action: "approve" });
  const race = await Promise.all([1, 2, 3].map(() => reqAction(mp, r, { action: "pay", paidFrom: "firm_float" })));
  eq("Three simultaneous pays of one requisition: one succeeds", race.filter((x) => x.status === 200).length, 1);
  await integrity("after invalid and race cases");
}

async function cycle10() {
  currentCycle = 10;
  const d = ids.clientD!;
  const m = ids.matterD1!;
  let n = 0;
  const s = (label: string) => `Step ${++n}: ${label}`;

  ok(await intake(mp, { clientId: d, matterId: m, destination: "trust_vault", trustAccountId: ids.vault, amountCents: 100000, lines: [{ lineType: "trust_hold", amountCents: 100000 }] }), s("Client D pays 1,000 cash deposit into trust cash"));
  eq(s("Trust balance 1,000"), await trustBalance(d), 100000);
  ok(await mp.call("POST", "/api/trust/vault/bank-in", { vaultAccountId: ids.vault, bankAccountId: ids.bank, clientId: d, matterId: m, amountCents: 60000, occurredAt: today() }), s("Bank 600 of the cash into trust bank"));
  const [vaultBal] = await sql`select coalesce(sum(amount_cents),0)::int s from trust_ledger_entries where client_id = ${d} and trust_account_id = ${ids.vault!}`;
  eq(s("400 remains in trust cash"), vaultBal!.s, 40000);
  await integrity("E2E after deposit and banking");
  const r1 = await requisition(acc, { type: "disbursement", clientId: d, matterId: m, description: `${TAG} D lodging fee`, amountCents: 25000 });
  record(s("Request disbursement 250"), "created", r1 ? "created" : "failed", Boolean(r1));
  ok(await reqAction(mp, r1, { action: "approve" }), s("Approve"));
  ok(await reqAction(acc, r1, { action: "pay", paidFrom: "trust", paymentRef: "FINQA-D1" }), s("Pay from trust bank"));
  eq(s("Trust balance 750"), await trustBalance(d), 75000);
  const r2 = await requisition(acc, { type: "disbursement", clientId: d, matterId: m, description: `${TAG} D courier`, amountCents: 900000 });
  ok(await reqAction(mp, r2, { action: "approve" }), s("Approve large disbursement 9,000"));
  ok(await reqAction(mp, r2, { action: "pay", paidFrom: "trust_then_float", paymentRef: "FINQA-D2" }), s("Pay: trust bank first, float for the balance"));
  const [bankLeft] = await sql`select coalesce(sum(amount_cents),0)::int s from trust_ledger_entries where client_id = ${d} and trust_account_id = ${ids.bank!}`;
  eq(s("Trust bank for D used to 0"), bankLeft!.s, 0);
  await integrity("E2E after disbursements");
  const bill = await mp.call("POST", "/api/invoices", { matterId: m, includeTime: false, includeDisbursements: true });
  ok(bill, s("Invoice unbilled float disbursement for recovery"));
  const billId = bill.body?.invoice?.id;
  const lines = await mp.call("GET", `/api/invoices/${billId}`);
  // 350 of the 9,000 came from trust bank; only the 8,650 float advance is recoverable.
  eq(s("Only the float part is billed (trust-paid part is not billed twice)"), lines.body?.invoice?.totalCents, 865000);
  let sent = await mp.call("PATCH", `/api/invoices/${billId}`, { status: "sent" });
  if (sent.status !== 200) {
    await mp.call("POST", `/api/invoices/${billId}/approval`, { action: "submit" });
    await mp.call("POST", `/api/invoices/${billId}/approval`, { action: "approve" });
    sent = await mp.call("PATCH", `/api/invoices/${billId}`, { status: "sent" });
  }
  ok(sent, s("Send recovery invoice"));
  ok(await mp.call("POST", `/api/invoices/${billId}/apply-retainer`, { amountCents: 40000, trustAccountId: ids.vault }), s("Apply the 400 cash trust to the invoice"));
  eq(s("Client D trust now 0"), await trustBalance(d), 0);
  const fee = await makeInvoice("D", "D1", 80000, "C10 fees");
  n++;
  ok(await intake(mp, { clientId: d, matterId: m, destination: "fee_bank", amountCents: 80000 + 825000, lines: [
    { lineType: "fee_revenue", feeCategory: "conveyancing", amountCents: 80000, invoiceId: fee },
    { lineType: "fee_revenue", feeCategory: "other_fee", amountCents: 825000, invoiceId: billId },
  ] }), s("Client pays fees and the recovery balance in one bank payment"));
  eq(s("Recovery invoice settled"), (await invoiceState(billId)).status, "paid");
  eq(s("Fee invoice settled"), (await invoiceState(fee)).status, "paid");
  ok(await reqAction(mp, r2, { action: "settle_recoverable" }), s("Mark the float advance as recovered"));
  await integrity("E2E after billing and recovery");
  const refund = await makeInvoice("D", "D1", 5000, "C10 correction");
  const p = ok(await mp.call("POST", `/api/invoices/${refund}/payments`, { amountCents: 5000, paidAt: today() }), s("Small fee paid"));
  ok(await mp.call("POST", `/api/invoices/${refund}/payments/${p.body?.payment?.id}/reverse`, { reason: "Paid by mistake, refunded" }), s("Reverse the mistaken receipt"));
  ok(await mp.call("PATCH", `/api/invoices/${refund}`, { status: "void" }), s("Void the corrected invoice"));
  const tb = await mp.call("GET", "/api/finance/gl/trial-balance");
  record(s("Trial balance loads"), "HTTP 200", `HTTP ${tb.status}`, tb.status === 200);
  const exp = await mp.call("GET", `/api/export/trust_statement?format=pdf&clientId=${d}`);
  record(s("Trust statement PDF"), "HTTP 200", `HTTP ${exp.status}`, exp.status === 200);
  await integrity("E2E final");
}

async function buttonSweep() {
  currentCycle = 11;
  const gets = [
    "/api/trust/overview",
    "/api/trust/accounts",
    "/api/trust/ledger",
    `/api/trust/ledger?clientId=${ids.clientA}`,
    "/api/trust/vault",
    "/api/finance/payments",
    "/api/finance/requisitions",
    "/api/finance/requisitions?recoverable=1",
    "/api/finance/debtors",
    "/api/finance/kpis",
    "/api/finance/reports",
    "/api/finance/client-accounts",
    `/api/finance/client-accounts/${ids.clientA}`,
    "/api/finance/gl/accounts",
    "/api/finance/gl/journals",
    "/api/finance/gl/trial-balance",
    "/api/finance/gl/statements?kind=pl&from=2026-01-01&to=2026-12-31",
    "/api/finance/gl/statements?kind=balance_sheet&asOf=2026-12-31",
    "/api/finance/expenses",
    "/api/finance/cashbook",
    "/api/finance/petty-cash",
    "/api/finance/creditors",
    "/api/finance/reconciliations",
    "/api/finance/period-locks",
    "/api/invoices",
    "/api/finance/integrity",
    "/api/export/debtors?format=xlsx",
    "/api/export/gl_trial_balance?format=pdf",
  ];
  for (const g of gets) {
    const r = await mp.call("GET", g);
    record(`GET ${g}`, "HTTP 200", `HTTP ${r.status}${r.status >= 400 ? `: ${errText(r)}` : ""}`, r.status === 200);
  }
  ok(
    await mp.call("POST", "/api/trust/vault/counts", {
      vaultAccountId: ids.vault,
      countedAt: new Date().toISOString(),
      countedBalanceCents: 0,
      notes: `${TAG} vault count`,
    }),
    "Record a physical vault count",
  );
}

// ---------- cleanup ----------
async function cleanup() {
  const clientRows = await sql`select id from clients where firm_id = ${FIRM} and full_name like ${`${TAG}%`}`;
  const clientIds = clientRows.map((r) => r.id as string);
  const acctRows = await sql`select id from trust_accounts where firm_id = ${FIRM} and name like ${`${TAG}%`}`;
  const acctIds = acctRows.map((r) => r.id as string);
  await sql.begin(async (tx) => {
    const t = tx as unknown as typeof sql;
    if (clientIds.length || acctIds.length) {
      await t`update trust_ledger_entries set reversed_by_id = null, reversal_of_id = null
        where firm_id = ${FIRM} and (client_id = any(${clientIds}) or trust_account_id = any(${acctIds}))`;
      await t`update finance_requisitions set trust_entry_id = null where firm_id = ${FIRM} and client_id = any(${clientIds})`;
      await t`update disbursements set trust_entry_id = null where firm_id = ${FIRM}
        and matter_id in (select id from matters where client_id = any(${clientIds}))`;
      await t`delete from trust_vault_bank_ins where firm_id = ${FIRM} and (client_id = any(${clientIds}) or vault_account_id = any(${acctIds}))`;
      await t`delete from trust_vault_counts where firm_id = ${FIRM} and vault_account_id = any(${acctIds})`;
      await t`delete from trust_ledger_entries where firm_id = ${FIRM} and (client_id = any(${clientIds}) or trust_account_id = any(${acctIds}))`;
    }
    const invIds = (await t`select id from invoices where firm_id = ${FIRM} and client_id = any(${clientIds})`).map((r) => r.id as string);
    await t`update fee_payments set reversed_by_id = null, reversal_of_id = null where firm_id = ${FIRM} and invoice_id = any(${invIds})`;
    await t`delete from fee_payments where firm_id = ${FIRM} and invoice_id = any(${invIds})`;
    await t`delete from finance_requisitions where firm_id = ${FIRM} and (client_id = any(${clientIds}) or description like ${`${TAG}%`})`;
    await t`delete from firm_expenses where firm_id = ${FIRM} and payee like ${`${TAG}%`}`;
    await t`update disbursements set invoice_id = null where firm_id = ${FIRM} and invoice_id = any(${invIds})`;
    await t`delete from invoice_lines where firm_id = ${FIRM} and invoice_id = any(${invIds})`;
    await t`delete from invoices where id = any(${invIds})`;
    await t`delete from disbursements where firm_id = ${FIRM} and matter_id in (select id from matters where client_id = any(${clientIds}))`;
    await t`delete from finance_payment_allocation_lines where firm_id = ${FIRM}
      and intake_id in (select id from finance_payment_intakes where client_id = any(${clientIds}))`;
    await t`delete from finance_payment_intakes where firm_id = ${FIRM} and client_id = any(${clientIds})`;
    // Sandbox firm holds no real books: every journal in it comes from these runs.
    await t`update gl_journal_entries set reversed_by_entry_id = null where firm_id = ${FIRM}`;
    await t`delete from gl_journal_lines where firm_id = ${FIRM}`;
    await t`delete from gl_journal_entries where firm_id = ${FIRM}`;
    await t`delete from matters where firm_id = ${FIRM} and client_id = any(${clientIds})`;
    await t`delete from clients where id = any(${clientIds})`;
    await t`delete from trust_accounts where id = any(${acctIds})`;
  });
}

async function main() {
  const started = new Date().toISOString();
  let fatal: string | null = null;
  try {
    await setup();
    for (const c of [cycle1, cycle2, cycle3, cycle4, cycle5, cycle6, cycle7, cycle8, cycle9, cycle10, buttonSweep]) {
      try {
        await c();
      } catch (e) {
        record("Cycle crashed", "no crash", String((e as Error).stack ?? e).slice(0, 400), false);
      }
    }
  } catch (e) {
    fatal = String((e as Error).stack ?? e);
    console.error(fatal);
  } finally {
    if (process.env.FIN_QA_KEEP !== "1") {
      await cleanup().catch((e) => console.error("cleanup failed", e));
    }
    const summary = {
      started,
      finished: new Date().toISOString(),
      fatal,
      total: steps.length,
      passed: steps.filter((s) => s.pass).length,
      failed: steps.filter((s) => !s.pass),
      byCycle: Object.fromEntries(
        [...new Set(steps.map((s) => s.cycle))].map((c) => [
          c,
          { total: steps.filter((s) => s.cycle === c).length, passed: steps.filter((s) => s.cycle === c && s.pass).length },
        ]),
      ),
      integrityRuns,
      steps,
    };
    writeFileSync(OUT, JSON.stringify(summary, null, 2));
    console.log(`\n${summary.passed}/${summary.total} steps passed. Result: ${OUT}`);
    await sql.end();
    process.exit(fatal || summary.failed.length ? 1 : 0);
  }
}

main();
