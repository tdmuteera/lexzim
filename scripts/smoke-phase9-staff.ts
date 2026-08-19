/**
 * P9-05: per-person access ticks.
 * Usage: npm run smoke:phase9-staff
 * Requires: app running, MP credentials, seats available.
 */
import { config } from "dotenv";

config({ path: ".env.local" });

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const MP_EMAIL = process.env.SMOKE_MP_EMAIL ?? "mp@lexzim.local";
const MP_PASSWORD = process.env.SMOKE_MP_PASSWORD ?? "<set-in-env>";

type Json = Record<string, unknown>;

async function fetchJson(
  path: string,
  init?: RequestInit & { cookieJar?: Map<string, string> },
): Promise<{ status: number; body: Json; cookies: Map<string, string> }> {
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

async function main() {
  let failed = 0;
  function check(name: string, ok: boolean) {
    if (ok) console.log(`ok  ${name}`);
    else {
      failed += 1;
      console.log(`FAIL  ${name}`);
    }
  }

  const mp = await login(MP_EMAIL, MP_PASSWORD);
  const meRes = await fetchJson("/api/auth/me", { cookieJar: mp });
  const me = dataOf(meRes.body).user as Json | undefined;
  const mpId = typeof me?.id === "string" ? me.id : "";
  check("MP session", Boolean(mpId));

  const strip = await fetchJson(`/api/staff/${mpId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ permissionCodes: ["dashboard.view"] }),
    cookieJar: mp,
  });
  check("MP cannot drop own users.manage", strip.status === 400 || strip.status === 422);

  const stamp = Date.now().toString(36);
  const email = `p905.${stamp}@lexzim.local`;
  const password = "<set-in-env>";
  const created = await fetchJson("/api/staff", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      fullName: "P905 Client Clerk",
      jobTitle: "Clerk",
      password,
      permissionCodes: ["dashboard.view", "clients.view"],
      forceChange: false,
    }),
    cookieJar: mp,
  });
  check("MP creates user with clients tick", created.status === 201 && created.body.ok === true);

  const clerk = await login(email, password);
  const crm = await fetchJson("/api/crm/overview", { cookieJar: clerk });
  check("CRM API 403 without crm.view", crm.status === 403);

  const clients = await fetchJson("/api/clients", { cookieJar: clerk });
  check("Clients API 200 with clients.view", clients.status === 200);

  const meClerk = await fetchJson("/api/auth/me", { cookieJar: clerk });
  const perms = ((dataOf(meClerk.body).user as Json | undefined)?.permissions ?? []) as string[];
  check("CRM permission absent on session", !perms.includes("crm.view"));
  check("Clients permission present on session", perms.includes("clients.view"));

  if (failed) {
    console.error(`\n${failed} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nP9-05 staff access smoke passed.");
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
