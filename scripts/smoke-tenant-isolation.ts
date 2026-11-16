/**
 * Cross-tenant IDOR matrix (app-layer firm_id isolation).
 *
 * Proves firm A cannot GET/PATCH foreign firm B resources (and reverse)
 * for clients, matters, invoices, and trust accounts.
 *
 * Usage:
 *   SMOKE_BASE_URL=http://localhost:3000 npm run smoke:tenant-isolation
 *
 * Credentials (defaults match docs/DEV_SEEDS.md):
 *   SMOKE_PASSWORD or DEV_SEED_PASSWORD
 *   SMOKE_PILOT_EMAIL (default mp@lexzim.local)
 *   SMOKE_ISOLATION_EMAIL (default isolation@lexzim.local)
 */
import { config } from "dotenv";

config({ path: ".env.local" });

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const PASSWORD =
  process.env.SMOKE_PASSWORD ?? process.env.DEV_SEED_PASSWORD ?? "<set-in-env>";
const PILOT_EMAIL = process.env.SMOKE_PILOT_EMAIL ?? "mp@lexzim.local";
const ISO_EMAIL = process.env.SMOKE_ISOLATION_EMAIL ?? "isolation@lexzim.local";

type Json = Record<string, unknown>;
type Jar = Map<string, string>;

async function fetchJson(
  path: string,
  init?: RequestInit & { cookieJar?: Jar },
): Promise<{ status: number; body: Json; cookies: Jar }> {
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
  const body = ct.includes("application/json")
    ? ((await res.json().catch(() => ({}))) as Json)
    : {};
  return { status: res.status, body, cookies: jar };
}

async function login(email: string, password: string): Promise<Jar> {
  const jar = new Map<string, string>();
  const res = await fetchJson("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    cookieJar: jar,
  });
  if (res.status !== 200 || res.body.ok !== true) {
    throw new Error(`Login failed for ${email}: status=${res.status}`);
  }
  return jar;
}

function dataOf(body: Json): Json {
  return (body.data as Json) ?? {};
}

function denied(status: number): boolean {
  return status === 403 || status === 404;
}

let passed = 0;
let failed = 0;
let skipped = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed += 1;
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed += 1;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function skip(name: string, reason: string) {
  skipped += 1;
  console.log(`SKIP  ${name} — ${reason}`);
}

async function createClientMatter(jar: Jar, label: string) {
  const stamp = Date.now();
  const clientRes = await fetchJson("/api/clients", {
    method: "POST",
    cookieJar: jar,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientType: "individual",
      fullName: `Isolation ${label} Client ${stamp}`,
      email: `iso-${label}-${stamp}@example.zw`,
    }),
  });
  const clientId = (dataOf(clientRes.body).client as Json | undefined)?.id as
    | string
    | undefined;
  if (!clientId) {
    throw new Error(
      `Create client failed (${label}): status=${clientRes.status} body=${JSON.stringify(clientRes.body).slice(0, 200)}`,
    );
  }

  const matterRes = await fetchJson("/api/matters", {
    method: "POST",
    cookieJar: jar,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId,
      title: `Isolation ${label} Matter ${stamp}`,
      areaOfLaw: "Civil",
      status: "open",
    }),
  });
  const matterId = (dataOf(matterRes.body).matter as Json | undefined)?.id as
    | string
    | undefined;
  if (!matterId) {
    throw new Error(
      `Create matter failed (${label}): status=${matterRes.status} body=${JSON.stringify(matterRes.body).slice(0, 200)}`,
    );
  }

  return { clientId, matterId, stamp };
}

async function createTrustAccount(jar: Jar, label: string, stamp: number) {
  const res = await fetchJson("/api/trust/accounts", {
    method: "POST",
    cookieJar: jar,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: `Iso ${label} Trust ${stamp}`,
      currency: "USD",
      accountKind: "bank",
      accountRef: `ISO-${label}-${stamp}`,
      isActive: true,
    }),
  });
  const accountId = (dataOf(res.body).account as Json | undefined)?.id as
    | string
    | undefined;
  return { status: res.status, accountId };
}

async function createServiceInvoice(
  jar: Jar,
  clientId: string,
  matterId: string,
) {
  const res = await fetchJson("/api/invoices", {
    method: "POST",
    cookieJar: jar,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId,
      matterId,
      currency: "USD",
      lines: [
        {
          description: "Isolation IDOR smoke line",
          qty: 1,
          unitPriceCents: 10000,
        },
      ],
    }),
  });
  const invoiceId = (dataOf(res.body).invoice as Json | undefined)?.id as
    | string
    | undefined;
  return { status: res.status, invoiceId };
}

async function assertIdor(
  label: string,
  attacker: Jar,
  path: string,
  method: "GET" | "PATCH" | "DELETE",
  body?: unknown,
) {
  const res = await fetchJson(path, {
    method,
    cookieJar: attacker,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  check(
    `${label} ${method} ${path}`,
    denied(res.status),
    `status=${res.status}`,
  );
  return res;
}

async function listDoesNotContain(
  label: string,
  jar: Jar,
  listPath: string,
  foreignId: string,
  pickIds: (body: Json) => string[],
) {
  const res = await fetchJson(listPath, { cookieJar: jar });
  if (res.status !== 200) {
    check(`${label} list ${listPath}`, false, `status=${res.status}`);
    return;
  }
  const ids = pickIds(res.body);
  check(
    `${label} list excludes foreign id`,
    !ids.includes(foreignId),
    `count=${ids.length}`,
  );
}

async function runDirection(
  ownerLabel: string,
  attackerLabel: string,
  owner: Jar,
  attacker: Jar,
) {
  console.log(`\n--- ${ownerLabel} owns → ${attackerLabel} attacks ---\n`);

  const { clientId, matterId, stamp } = await createClientMatter(owner, ownerLabel);
  check(`${ownerLabel} seeded client+matter`, Boolean(clientId && matterId));

  await assertIdor(
    `${attackerLabel}→${ownerLabel} client`,
    attacker,
    `/api/clients/${clientId}`,
    "GET",
  );
  await assertIdor(
    `${attackerLabel}→${ownerLabel} client`,
    attacker,
    `/api/clients/${clientId}`,
    "PATCH",
    {
      clientType: "individual",
      fullName: "IDOR rewrite attempt",
    },
  );
  await assertIdor(
    `${attackerLabel}→${ownerLabel} matter`,
    attacker,
    `/api/matters/${matterId}`,
    "GET",
  );
  await assertIdor(
    `${attackerLabel}→${ownerLabel} matter`,
    attacker,
    `/api/matters/${matterId}`,
    "PATCH",
    {
      clientId,
      title: "IDOR rewrite attempt",
      areaOfLaw: "Civil",
      status: "open",
    },
  );

  await listDoesNotContain(
    `${attackerLabel} clients vs ${ownerLabel}`,
    attacker,
    "/api/clients",
    clientId,
    (body) => {
      const items =
        (dataOf(body).items as Array<{ id: string }> | undefined) ??
        (dataOf(body).clients as Array<{ id: string }> | undefined) ??
        [];
      return items.map((i) => i.id).filter(Boolean);
    },
  );
  await listDoesNotContain(
    `${attackerLabel} matters vs ${ownerLabel}`,
    attacker,
    "/api/matters?bucket=all",
    matterId,
    (body) => {
      const items = (dataOf(body).items as Array<{ id: string }> | undefined) ?? [];
      return items.map((i) => i.id).filter(Boolean);
    },
  );

  const inv = await createServiceInvoice(owner, clientId, matterId);
  if (inv.invoiceId) {
    check(`${ownerLabel} seeded invoice`, true, inv.invoiceId);
    await assertIdor(
      `${attackerLabel}→${ownerLabel} invoice`,
      attacker,
      `/api/invoices/${inv.invoiceId}`,
      "GET",
    );
    await assertIdor(
      `${attackerLabel}→${ownerLabel} invoice`,
      attacker,
      `/api/invoices/${inv.invoiceId}`,
      "PATCH",
      { status: "void" },
    );
    await listDoesNotContain(
      `${attackerLabel} invoices vs ${ownerLabel}`,
      attacker,
      "/api/invoices",
      inv.invoiceId,
      (body) => {
        const items = (dataOf(body).items as Array<{ id: string }> | undefined) ?? [];
        return items.map((i) => i.id).filter(Boolean);
      },
    );
  } else {
    skip(
      `${ownerLabel} invoice IDOR`,
      `create status=${inv.status} (billing.manage / licence?)`,
    );
  }

  const trust = await createTrustAccount(owner, ownerLabel, stamp);
  if (trust.accountId) {
    check(`${ownerLabel} seeded trust account`, true, trust.accountId);
    await assertIdor(
      `${attackerLabel}→${ownerLabel} trust`,
      attacker,
      `/api/trust/accounts/${trust.accountId}`,
      "GET",
    );
    await assertIdor(
      `${attackerLabel}→${ownerLabel} trust`,
      attacker,
      `/api/trust/accounts/${trust.accountId}`,
      "PATCH",
      {
        name: "IDOR rewrite",
        currency: "USD",
        accountKind: "bank",
        isActive: true,
      },
    );
    await listDoesNotContain(
      `${attackerLabel} trust vs ${ownerLabel}`,
      attacker,
      "/api/trust/accounts?active=all",
      trust.accountId,
      (body) => {
        const items = (dataOf(body).items as Array<{ id: string }> | undefined) ?? [];
        return items.map((i) => i.id).filter(Boolean);
      },
    );
  } else {
    skip(
      `${ownerLabel} trust IDOR`,
      `create status=${trust.status} (trust.manage / licence?)`,
    );
  }

  // Documents: use an existing doc id if the owner has one; upload is heavier.
  const docs = await fetchJson(`/api/matters/${matterId}/documents`, {
    cookieJar: owner,
  });
  const docItems =
    (dataOf(docs.body).items as Array<{ id: string }> | undefined) ??
    (dataOf(docs.body).documents as Array<{ id: string }> | undefined) ??
    [];
  const docId = docItems[0]?.id;
  if (docId) {
    await assertIdor(
      `${attackerLabel}→${ownerLabel} document`,
      attacker,
      `/api/documents/${docId}`,
      "GET",
    );
    await assertIdor(
      `${attackerLabel}→${ownerLabel} document`,
      attacker,
      `/api/documents/${docId}`,
      "PATCH",
      { title: "IDOR rewrite" },
    );
  } else {
    skip(`${ownerLabel} document IDOR`, "no matter documents to probe");
  }
}

async function main() {
  console.log(`Tenant isolation IDOR matrix @ ${BASE}`);
  console.log(`Pilot: ${PILOT_EMAIL} | Isolation: ${ISO_EMAIL}\n`);

  if (!PASSWORD) {
    console.error("Set SMOKE_PASSWORD or DEV_SEED_PASSWORD.");
    process.exit(1);
  }

  const pilot = await login(PILOT_EMAIL, PASSWORD);
  const iso = await login(ISO_EMAIL, PASSWORD);
  check("Pilot MP login", true);
  check("Isolation MP login", true);

  await runDirection("pilot", "isolation", pilot, iso);
  await runDirection("isolation", "pilot", iso, pilot);

  console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
  if (failed > 0) {
    console.error("\nTenant isolation smoke FAILED.");
    process.exit(1);
  }
  console.log("\nTenant isolation smoke OK.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
