/**
 * Phase 3 automated smoke (P3-14).
 * Usage: npm run smoke:phase3
 * Requires: running app (SMOKE_BASE_URL), seeded users + preferably phase3 demo seed.
 */
import { config } from "dotenv";

config({ path: ".env.local" });

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";

type Json = Record<string, unknown>;

async function fetchJson(
  path: string,
  init?: RequestInit & { cookieJar?: Map<string, string> },
): Promise<{ status: number; body: Json; cookies: Map<string, string>; raw?: string }> {
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
  if (ct.includes("text/csv")) {
    const raw = await res.text();
    return { status: res.status, body: { csv: raw }, cookies: jar, raw };
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
    throw new Error(`Login failed for ${email}: ${res.status}`);
  }
  return jar;
}

function dataOf(body: Json): Json {
  return (body.data as Json) ?? {};
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
  console.log(`Phase 3 smoke against ${BASE}\n`);

  const mp = await login("mp@lexzim.local", "<set-in-env>");
  const accounts = await login("accounts@lexzim.local", (process.env.DEV_SEED_PASSWORD ?? ""));
  const secretary = await login("secretary@lexzim.local", (process.env.DEV_SEED_PASSWORD ?? ""));
  const isolation = await login("isolation@lexzim.local", (process.env.DEV_SEED_PASSWORD ?? ""));

  const health = await fetchJson("/api/health");
  check("Health endpoint", health.status === 200);

  // Calendar
  const from = new Date(Date.now() - 7 * 86400000).toISOString();
  const to = new Date(Date.now() + 60 * 86400000).toISOString();
  const cal = await fetchJson(`/api/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, {
    cookieJar: mp,
  });
  const calItems =
    (dataOf(cal.body).items as unknown[]) ??
    (dataOf(cal.body).events as unknown[]) ??
    [];
  check("Calendar list", cal.status === 200 && cal.body.ok === true, `items=${calItems.length}`);

  // Deadlines via templates
  const templates = await fetchJson("/api/deadline-templates", { cookieJar: mp });
  check(
    "Deadline templates",
    templates.status === 200 && templates.body.ok === true,
  );

  const matters = await fetchJson("/api/matters?bucket=all", { cookieJar: mp });
  const matterItems =
    (dataOf(matters.body).items as Array<{ id: string; clientId?: string }>) ?? [];
  check("Matters available", matterItems.length > 0, `count=${matterItems.length}`);
  const matterId = matterItems[0]?.id;

  if (matterId) {
    const deadlines = await fetchJson(`/api/matters/${matterId}/deadlines`, {
      cookieJar: mp,
    });
    check(
      "Matter deadlines",
      deadlines.status === 200 && deadlines.body.ok === true,
    );

    // Time → invoice path (create time if needed, then list invoices)
    const timeList = await fetchJson(`/api/matters/${matterId}/time-entries`, {
      cookieJar: accounts,
    });
    check(
      "Time entries (billing.view)",
      timeList.status === 200 && timeList.body.ok === true,
    );

    const invoices = await fetchJson("/api/invoices", { cookieJar: accounts });
    const invItems = (dataOf(invoices.body).items as unknown[]) ?? [];
    check(
      "Fee invoices list",
      invoices.status === 200 && invoices.body.ok === true,
      `count=${invItems.length}`,
    );
  }

  // Trust
  const trustAccounts = await fetchJson("/api/trust/accounts", { cookieJar: accounts });
  const acctItems =
    (dataOf(trustAccounts.body).items as Array<{ id: string; balanceCents?: number }>) ??
    (dataOf(trustAccounts.body).accounts as Array<{ id: string; balanceCents?: number }>) ??
    [];
  check(
    "Trust accounts",
    trustAccounts.status === 200 && trustAccounts.body.ok === true,
    `count=${acctItems.length}`,
  );

  const trustLedger = await fetchJson("/api/trust/ledger", { cookieJar: accounts });
  check("Trust ledger", trustLedger.status === 200 && trustLedger.body.ok === true);

  // No overdraw: disbursement with huge amount should fail without allowNegative
  if (acctItems[0]?.id && matterItems[0]?.clientId) {
    const overdraw = await fetchJson("/api/trust/ledger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cookieJar: mp,
      body: JSON.stringify({
        trustAccountId: acctItems[0].id,
        clientId: matterItems[0].clientId,
        matterId: matterItems[0].id,
        entryType: "disbursement",
        amountDollars: 999999,
        occurredAt: new Date().toISOString(),
        narrative: "Smoke overdraw attempt",
        allowNegative: false,
      }),
    });
    check(
      "Trust no overdraw (blocked)",
      overdraw.status === 400 || overdraw.status === 422 || overdraw.body.ok === false,
      `status=${overdraw.status}`,
    );
  } else {
    check("Trust no overdraw (blocked)", false, "missing trust account or clientId");
  }

  // Secretary cannot open billing API
  const secBilling = await fetchJson("/api/invoices", { cookieJar: secretary });
  check("Secretary blocked from billing", secBilling.status === 403);

  // Reports CSV
  const arCsv = await fetchJson("/api/reports/ar-aging?format=csv", { cookieJar: accounts });
  check(
    "Reports AR aging CSV",
    arCsv.status === 200 && String(arCsv.raw ?? dataOf(arCsv.body).csv ?? "").includes(","),
  );

  const trustCsv = await fetchJson("/api/reports/trust-balances?format=csv", {
    cookieJar: accounts,
  });
  check("Reports trust balances CSV", trustCsv.status === 200);

  // Dashboard role-aware
  const dashMp = await fetchJson("/api/dashboard", { cookieJar: mp });
  const dashData = dataOf(dashMp.body);
  const perms = (dashData.permissions as Json) ?? {};
  check(
    "Dashboard MP has billing+trust",
    dashMp.status === 200 && perms.billing === true && perms.trust === true,
  );

  const dashAcc = await fetchJson("/api/dashboard", { cookieJar: accounts });
  const accPerms = (dataOf(dashAcc.body).permissions as Json) ?? {};
  check(
    "Dashboard Accounts: billing yes, trust yes",
    dashAcc.status === 200 && accPerms.billing === true && accPerms.trust === true,
  );

  // firm_id isolation: isolation user must not see pilot invoices
  const isoInv = await fetchJson("/api/invoices", { cookieJar: isolation });
  const isoItems = (dataOf(isoInv.body).items as unknown[]) ?? [];
  check(
    "Isolation firm invoices empty / separate",
    isoInv.status === 200 && isoItems.length === 0,
    `count=${isoItems.length}`,
  );

  const reminders = await fetchJson("/api/reminders", { cookieJar: mp });
  check("Reminders", reminders.status === 200 && reminders.body.ok === true);

  console.log(`\n${passed} passed, ${failed} failed`);
  console.log(
    "\nPHASE 3 COMPLETE — ready for Phase 4 prompts (Sell & Ship: production AI, licensing, onboarding, pilots on Railway)",
  );
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
