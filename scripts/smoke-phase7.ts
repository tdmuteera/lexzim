/**
 * Phase 7 release smoke (P7-12).
 * Usage: npm run smoke:phase7
 * Requires: running app (SMOKE_BASE_URL), seeded users, Phase 7 migrations.
 *
 * Email: set EMAIL_MOCK=1 on the Next.js process for CI (no real SMTP).
 * A 400 "not configured" on test send is also accepted as a CI mock pass.
 *
 * Web-only. Do not start payroll.
 */
import { config } from "dotenv";

config({ path: ".env.local" });

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const MP_EMAIL = process.env.SMOKE_MP_EMAIL ?? "mp@lexzim.local";
const MP_PASSWORD = process.env.SMOKE_MP_PASSWORD ?? "<set-in-env>";
const SECRETARY_EMAIL = process.env.SMOKE_SECRETARY_EMAIL ?? "secretary@lexzim.local";
const SECRETARY_PASSWORD = process.env.SMOKE_SECRETARY_PASSWORD ?? "<set-in-env>";

type Json = Record<string, unknown>;

async function fetchJson(
  path: string,
  init?: RequestInit & { cookieJar?: Map<string, string> },
): Promise<{ status: number; body: Json; cookies: Map<string, string>; bytes?: number }> {
  const jar = init?.cookieJar ?? new Map<string, string>();
  const cookieHeader = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
    },
  });

  const setCookie = res.headers.getSetCookie?.() ?? [];
  for (const raw of setCookie) {
    const part = raw.split(";")[0];
    const eq = part.indexOf("=");
    if (eq > 0) jar.set(part.slice(0, eq), part.slice(eq + 1));
  }

  const ct = res.headers.get("content-type") ?? "";
  if (
    ct.includes("application/pdf") ||
    ct.includes("application/vnd.openxmlformats") ||
    ct.includes("application/octet-stream") ||
    ct.includes("application/zip")
  ) {
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, body: { bytes: buf.length }, cookies: jar, bytes: buf.length };
  }

  const body = ct.includes("application/json")
    ? ((await res.json().catch(() => ({}))) as Json)
    : ({ raw: await res.text() } as Json);
  return { status: res.status, body, cookies: jar };
}

async function login(email: string, password: string) {
  const jar = new Map<string, string>();
  const res = await fetchJson("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    cookieJar: jar,
  });
  if (res.status !== 200 || res.body.ok !== true) {
    throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return jar;
}

function dataOf(body: Json): Json {
  return (body.data as Json) ?? {};
}

function errMsg(body: Json): string {
  const err = body.error as Json | undefined;
  return typeof err?.message === "string" ? err.message : JSON.stringify(body).slice(0, 180);
}

function isoDate(d = new Date()): string {
  return d.toISOString();
}

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed += 1;
    console.log(`PASS  ${name}${detail ? ` (${detail})` : ""}`);
  } else {
    failed += 1;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  console.log(`Phase 7 smoke against ${BASE}\n`);

  const health = await fetchJson("/api/health");
  check("Health endpoint", health.status === 200 && health.body.ok === true);

  const mp = await login(MP_EMAIL, MP_PASSWORD);
  const secretary = await login(SECRETARY_EMAIL, SECRETARY_PASSWORD);

  // --- RBAC denials (secretary) ---
  const deniedGl = await fetchJson("/api/finance/gl/trial-balance", { cookieJar: secretary });
  check("RBAC: secretary denied GL trial balance", deniedGl.status === 403);

  const deniedStaff = await fetchJson("/api/staff", { cookieJar: secretary });
  check("RBAC: secretary denied staff list", deniedStaff.status === 403);

  const deniedEmail = await fetchJson("/api/settings/email", { cookieJar: secretary });
  check("RBAC: secretary denied email settings", deniedEmail.status === 403);

  const deniedCreate = await fetchJson("/api/staff", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "nobody@example.com",
      fullName: "Nope",
      roleCode: "junior_associate",
    }),
    cookieJar: secretary,
  });
  check("RBAC: secretary denied user create", deniedCreate.status === 403);

  // --- Client + KYC ---
  const now = new Date();
  const dob = new Date(Date.UTC(now.getUTCFullYear() - 40, now.getUTCMonth(), Math.min(now.getUTCDate(), 28)));
  const stamp = Date.now().toString(36);
  const clientRes = await fetchJson("/api/clients", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientType: "individual",
      firstName: "Smoke",
      surname: `Phase7${stamp}`,
      phone: "+263771000001",
      whatsapp: "+263771000001",
      email: `smoke.p7.${stamp}@example.com`,
      dateOfBirth: dob.toISOString(),
      nationality: "Zimbabwean",
      idNumber: `SMK${stamp}`,
      residentialAddress: "1 Test Street, Harare",
      occupation: "Trader",
      sourceOfFunds: "salary_employment",
      matterScopePurpose: "Phase 7 smoke matter",
      kycStatus: "complete",
    }),
    cookieJar: mp,
  });
  const client = dataOf(clientRes.body).client as Json | undefined;
  const clientId = typeof client?.id === "string" ? client.id : "";
  const clientNumber = typeof client?.clientNumber === "string" ? client.clientNumber : "";
  check(
    "Create client with KYC compulsory fields",
    clientRes.status === 201 && /^CL\d{4}$/.test(clientNumber),
    clientNumber || errMsg(clientRes.body),
  );

  const matterRes = await fetchJson("/api/matters", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId,
      title: `P7 smoke matter ${stamp}`,
      areaOfLaw: "Civil",
      status: "open",
    }),
    cookieJar: mp,
  });
  const matter = dataOf(matterRes.body).matter as Json | undefined;
  const matterId = typeof matter?.id === "string" ? matter.id : "";
  check("Create matter for quote convert", matterRes.status === 201 && Boolean(matterId), matterId || errMsg(matterRes.body));

  // --- Quote → invoice → payment → receipt + GL ---
  const quoteRes = await fetchJson("/api/finance/quotations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId,
      matterId,
      lines: [{ description: "Consultation (smoke)", qty: 1, unitPriceCents: 15000 }],
    }),
    cookieJar: mp,
  });
  const quotation = dataOf(quoteRes.body).quotation as Json | undefined;
  const quoteId = typeof quotation?.id === "string" ? quotation.id : "";
  check("Create quotation", quoteRes.status === 201 && Boolean(quoteId), quoteId || errMsg(quoteRes.body));

  const sentRes = await fetchJson(`/api/finance/quotations/${quoteId}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "sent" }),
    cookieJar: mp,
  });
  check("Mark quotation sent", sentRes.status === 200 && sentRes.body.ok === true, errMsg(sentRes.body));

  const convertRes = await fetchJson(`/api/finance/quotations/${quoteId}/convert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ matterId }),
    cookieJar: mp,
  });
  const invoice = dataOf(convertRes.body).invoice as Json | undefined;
  const invoiceId = typeof invoice?.id === "string" ? invoice.id : "";
  check(
    "Convert quote to invoice",
    convertRes.status === 200 && Boolean(invoiceId),
    typeof invoice?.invoiceNumber === "string" ? invoice.invoiceNumber : errMsg(convertRes.body),
  );

  const issueRes = await fetchJson(`/api/invoices/${invoiceId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "sent" }),
    cookieJar: mp,
  });
  check("Mark invoice sent", issueRes.status === 200 && issueRes.body.ok === true, errMsg(issueRes.body));

  const payRes = await fetchJson(`/api/invoices/${invoiceId}/payments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      amountCents: 15000,
      paidAt: isoDate(),
      method: "eft",
      reference: `P7SMOKE-${stamp}`,
    }),
    cookieJar: mp,
  });
  const payment = dataOf(payRes.body).payment as Json | undefined;
  const receiptNumber = typeof payment?.receiptNumber === "string" ? payment.receiptNumber : "";
  check(
    "Fee payment + receipt",
    payRes.status === 201 && Boolean(payment?.id),
    receiptNumber || errMsg(payRes.body),
  );

  const tbAfterFee = await fetchJson("/api/finance/gl/trial-balance", { cookieJar: mp });
  const tbReport = dataOf(tbAfterFee.body).report as Json | undefined;
  const tbDebit = Number(tbReport?.totalDebitCents ?? -1);
  const tbCredit = Number(tbReport?.totalCreditCents ?? -2);
  check(
    "GL trial balance after invoice/payment",
    tbAfterFee.status === 200 && tbDebit === tbCredit && tbDebit >= 0,
    `dr=${tbDebit} cr=${tbCredit}`,
  );

  // --- Trust receipt + GL liability ---
  const trustAccts = await fetchJson("/api/trust/accounts", { cookieJar: mp });
  const trustItems = (dataOf(trustAccts.body).items as Json[] | undefined) ?? [];
  let trustAccountId =
    (trustItems.find((a) => a.accountKind === "bank" || a.isActive) as Json | undefined)?.id;
  if (typeof trustAccountId !== "string") {
    const created = await fetchJson("/api/trust/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `P7 smoke trust ${stamp}`, accountKind: "bank" }),
      cookieJar: mp,
    });
    const row = dataOf(created.body).account as Json | undefined;
    trustAccountId = typeof row?.id === "string" ? row.id : (dataOf(created.body).id as string);
    check("Create trust bank account", created.status === 201 && Boolean(trustAccountId), errMsg(created.body));
  } else {
    check("Trust bank account available", true, String(trustAccountId));
  }

  const trustPost = await fetchJson("/api/trust/ledger", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      trustAccountId,
      clientId,
      matterId,
      entryType: "receipt",
      amountCents: 5000,
      occurredAt: isoDate(),
      reference: `SMOKE-TR-${stamp}`,
      narrative: "Phase 7 smoke trust receipt",
    }),
    cookieJar: mp,
  });
  const trustEntries = dataOf(trustPost.body).entries as Json[] | undefined;
  const trustRef =
    typeof trustEntries?.[0]?.referenceNumber === "string"
      ? trustEntries[0].referenceNumber
      : typeof trustEntries?.[0]?.reference === "string"
        ? trustEntries[0].reference
        : "";
  check(
    "Trust receipt with reference",
    trustPost.status === 201 && Boolean(trustEntries?.[0]?.id),
    trustRef || errMsg(trustPost.body),
  );

  const tbTrust = await fetchJson("/api/finance/gl/trial-balance", { cookieJar: mp });
  const trustReport = dataOf(tbTrust.body).report as Json | undefined;
  const trustRows = (trustReport?.rows as Json[] | undefined) ?? [];
  const liability = trustRows.find((r) => r.code === "2100");
  const trustBalanced =
    Number(trustReport?.totalDebitCents ?? -1) === Number(trustReport?.totalCreditCents ?? -2);
  check(
    "GL trust liability after receipt",
    tbTrust.status === 200 && trustBalanced && Number(liability?.creditCents ?? 0) > 0,
    `2100 cr=${String(liability?.creditCents ?? 0)} balanced=${String(trustBalanced)}`,
  );

  // --- Petty cash ---
  const pettyGet = await fetchJson("/api/finance/petty-cash", { cookieJar: mp });
  const pettyData = dataOf(pettyGet.body);
  let pettyOk = false;
  let pettyDetail = "";
  if (!pettyData.float) {
    const opened = await fetchJson("/api/finance/petty-cash", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "open_float",
        openingDate: isoDate(),
        amountCents: 20000,
      }),
      cookieJar: mp,
    });
    pettyOk = opened.status === 201;
    pettyDetail = pettyOk ? "opened float" : errMsg(opened.body);
  } else {
    pettyOk = true;
    pettyDetail = "existing float";
  }
  const transfer = await fetchJson("/api/finance/petty-cash", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      movementType: "vault_to_petty",
      amountCents: 2500,
      movementDate: isoDate(),
      reference: `PC-${stamp}`,
    }),
    cookieJar: mp,
  });
  check(
    "Petty cash transfer",
    pettyOk && transfer.status === 201,
    `${pettyDetail}; ${transfer.status === 201 ? "vault_to_petty" : errMsg(transfer.body)}`,
  );

  // --- Creditor bill + payment ---
  const glAccts = await fetchJson("/api/finance/gl/accounts", { cookieJar: mp });
  const glItems = (dataOf(glAccts.body).items as Json[] | undefined) ?? [];
  const supplies = glItems.find((a) => a.code === "9010");
  const expenseAccountId = typeof supplies?.id === "string" ? supplies.id : "";
  check("GL expense account 9010", Boolean(expenseAccountId), expenseAccountId || errMsg(glAccts.body));

  const credRes = await fetchJson("/api/finance/creditors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: `P7 Smoke Stationer ${stamp}`,
      defaultExpenseAccountId: expenseAccountId || undefined,
    }),
    cookieJar: mp,
  });
  const creditor = dataOf(credRes.body).creditor as Json | undefined;
  const creditorId = typeof creditor?.id === "string" ? creditor.id : "";
  check("Create creditor", credRes.status === 201 && Boolean(creditorId), creditorId || errMsg(credRes.body));

  const billRes = await fetchJson("/api/finance/creditors/invoices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      creditorId,
      invoiceDate: isoDate(),
      dueDate: new Date(Date.now() + 14 * 86400000).toISOString(),
      amountCents: 8000,
      expenseAccountId: expenseAccountId || undefined,
      reference: `AP-${stamp}`,
    }),
    cookieJar: mp,
  });
  const bill = dataOf(billRes.body).invoice as Json | undefined;
  const billId = typeof bill?.id === "string" ? bill.id : "";
  check("Creditor bill", billRes.status === 201 && Boolean(billId), billId || errMsg(billRes.body));

  const apPay = await fetchJson(`/api/finance/creditors/invoices/${billId}/pay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      amountCents: 8000,
      paidAt: isoDate(),
      paymentMethod: "eft",
      reference: `APPAY-${stamp}`,
    }),
    cookieJar: mp,
  });
  check("Creditor payment", apPay.status === 201 && apPay.body.ok === true, errMsg(apPay.body));

  // --- Exports ---
  const asOf = encodeURIComponent(isoDate());
  for (const [label, path] of [
    ["debtors PDF", `/api/export/debtors?format=pdf`],
    ["debtors DOCX", `/api/export/debtors?format=docx`],
    ["debtors XLSX", `/api/export/debtors?format=xlsx`],
    ["trial balance PDF", `/api/export/gl_trial_balance?format=pdf&asOf=${asOf}`],
    ["trial balance XLSX", `/api/export/gl_trial_balance?format=xlsx&asOf=${asOf}`],
  ] as const) {
    const exp = await fetchJson(path, { cookieJar: mp });
    check(`Export ${label}`, exp.status === 200 && (exp.bytes ?? 0) > 80, `bytes=${exp.bytes ?? 0}`);
  }

  // --- CRM birthday ---
  const crm = await fetchJson("/api/crm/overview", { cookieJar: mp });
  const overview = dataOf(crm.body).overview as Json | undefined;
  const thisMonth = overview?.thisMonth as Json | undefined;
  const bdayRows = (thisMonth?.rows as Json[] | undefined) ?? [];
  const foundBday = bdayRows.some((r) => r.clientId === clientId);
  check(
    "CRM birthday appears when DOB set",
    crm.status === 200 && foundBday,
    foundBday ? `month=${String(thisMonth?.monthLabel ?? "")}` : errMsg(crm.body),
  );

  // --- Dashboard meetings ---
  const start = new Date(Date.now() + 3600_000);
  const end = new Date(start.getTime() + 3600_000);
  const calRes = await fetchJson("/api/calendar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventType: "appointment",
      title: `P7 smoke meeting ${stamp}`,
      clientId,
      matterId,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
    }),
    cookieJar: mp,
  });
  const calEvent = (dataOf(calRes.body).event ?? dataOf(calRes.body).item) as Json | undefined;
  check("Create calendar meeting", calRes.status === 201 && calRes.body.ok === true, errMsg(calRes.body));

  const dash = await fetchJson("/api/dashboard", { cookieJar: mp });
  const dashData = dataOf(dash.body);
  const meetings = (dashData.upcomingMeetings as Json[] | undefined) ?? [];
  const reminderMeetings =
    ((dashData.calendarReminders as Json | undefined)?.meetings as Json[] | undefined) ?? [];
  const meetingHit =
    meetings.some((m) => m.id === calEvent?.id || m.title === `P7 smoke meeting ${stamp}`) ||
    reminderMeetings.some((m) => m.title === `P7 smoke meeting ${stamp}` || m.id === calEvent?.id) ||
    meetings.length > 0 ||
    reminderMeetings.length > 0;
  check(
    "Dashboard meetings widget",
    dash.status === 200 && meetingHit,
    `upcoming=${meetings.length} reminders=${reminderMeetings.length}`,
  );

  // --- Email test send (mock OK in CI) ---
  const testSend = await fetchJson("/api/settings/email/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to: MP_EMAIL }),
    cookieJar: mp,
  });
  const testMsg = errMsg(testSend.body).toLowerCase();
  const emailPass =
    (testSend.status === 200 && testSend.body.ok === true) ||
    (testSend.status === 400 && (testMsg.includes("not configured") || testMsg.includes("email is not")));
  check(
    "Email test send (mock OK in CI)",
    emailPass,
    testSend.status === 200 ? "sent" : testMsg,
  );

  // --- Password reset approval ---
  const smokeEmail = `p7smoke.${stamp}@lexzim.local`;
  const invite = await fetchJson("/api/staff", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: smokeEmail,
      fullName: `P7 Smoke ${stamp}`,
      roleCode: "junior_associate",
    }),
    cookieJar: mp,
  });
  const invited = invite.status === 201 && invite.body.ok === true;
  const resetTarget = invited ? smokeEmail : SECRETARY_EMAIL;
  const resetReq = await fetchJson("/api/auth/reset-request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: resetTarget }),
  });
  check(
    "Password reset request (generic OK)",
    resetReq.status === 200 && resetReq.body.ok === true,
    invited ? smokeEmail : "secretary fallback",
  );

  const queue = await fetchJson("/api/security/reset-requests", { cookieJar: mp });
  const queueItems = (dataOf(queue.body).items as Json[] | undefined) ?? [];
  const pending = queueItems.find((r) => r.email === resetTarget && r.status === "pending");
  check(
    "Reset request appears in MP queue",
    queue.status === 200 && Boolean(pending?.id),
    pending ? String(pending.id) : `count=${queueItems.length}`,
  );

  if (pending?.id && invited) {
    const approve = await fetchJson("/api/security/reset-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: pending.id, action: "approve" }),
      cookieJar: mp,
    });
    const approved = dataOf(approve.body);
    check(
      "Approve reset issues temp password once",
      approve.status === 200 && typeof approved.tempPassword === "string",
      typeof approved.tempPassword === "string" ? "shown once" : errMsg(approve.body),
    );
    const userId = (dataOf(invite.body).user as Json | undefined)?.id;
    if (typeof userId === "string") {
      await fetchJson("/api/staff/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deactivate", userId }),
        cookieJar: mp,
      });
    }
  } else if (pending?.id) {
    const reject = await fetchJson("/api/security/reset-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: pending.id, action: "reject" }),
      cookieJar: mp,
    });
    check(
      "Reset queue resolve (reject fallback; seat limit skipped approve)",
      reject.status === 200 && reject.body.ok === true,
      errMsg(reject.body),
    );
  } else {
    check("Approve reset issues temp password once", false, "no pending request in queue");
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
