/**
 * P5-04: portal share isolation smoke.
 * Firm A portal user must not see firm B shares.
 *
 * Usage: npm run smoke:portal-shares
 */
import { config } from "dotenv";

config({ path: ".env.local" });

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";

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
  const body = (await res.json().catch(() => ({}))) as Json;
  return { status: res.status, body, cookies: jar };
}

async function staffLogin(email: string, password: string) {
  const jar = new Map<string, string>();
  const res = await fetchJson("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    cookieJar: jar,
  });
  if (res.status !== 200 || res.body.ok !== true) {
    throw new Error(`Staff login failed ${email}: ${res.status}`);
  }
  return jar;
}

async function portalLogin(email: string, password: string) {
  const jar = new Map<string, string>();
  const res = await fetchJson("/api/portal/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    cookieJar: jar,
  });
  if (res.status !== 200 || res.body.ok !== true) {
    throw new Error(`Portal login failed ${email}: ${res.status} ${JSON.stringify(res.body)}`);
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
  console.log(`Portal share isolation smoke against ${BASE}\n`);

  const mp = await staffLogin("mp@lexzim.local", "<set-in-env>");
  const isolationMp = await staffLogin("isolation@lexzim.local", (process.env.DEV_SEED_PASSWORD ?? ""));

  const pilotMatters = await fetchJson("/api/matters?bucket=all", { cookieJar: mp });
  const pilotItems =
    (dataOf(pilotMatters.body).items as Array<{ id: string; clientId: string; title: string }>) ??
    [];
  check("Pilot matters exist", pilotItems.length > 0, `count=${pilotItems.length}`);
  const matter = pilotItems[0];
  if (!matter) throw new Error("Need phase1 demo matters");

  // Default: portal user sees nothing before share
  const invitePilot = await fetchJson("/api/portal/invites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cookieJar: mp,
    body: JSON.stringify({
      clientId: matter.clientId,
      email: "portal.share.a@example.local",
      fullName: "Portal Share A",
      password: "<set-in-env>",
      createMagicLink: false,
    }),
  });
  check("Invite portal user A (pilot)", invitePilot.status === 200 && invitePilot.body.ok === true);

  const portalA = await portalLogin("portal.share.a@example.local", "<set-in-env>");
  const before = await fetchJson("/api/portal/me/shares", { cookieJar: portalA });
  const beforeMatters = (dataOf(before.body).matters as unknown[]) ?? [];
  check(
    "Share-nothing before grant",
    before.status === 200 && beforeMatters.length === 0,
    `count=${beforeMatters.length}`,
  );

  const share = await fetchJson("/api/portal/shares", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cookieJar: mp,
    body: JSON.stringify({
      type: "matter",
      clientId: matter.clientId,
      matterId: matter.id,
      permission: "read",
    }),
  });
  check("Create matter share", share.status === 200 && share.body.ok === true);

  const after = await fetchJson("/api/portal/me/shares", { cookieJar: portalA });
  const afterMatters = (dataOf(after.body).matters as Array<{ id: string }>) ?? [];
  check(
    "Portal A sees shared pilot matter",
    after.status === 200 && afterMatters.some((m) => m.id === matter.id),
    `count=${afterMatters.length}`,
  );

  // Isolation firm: create matter if needed, invite portal B, share isolation matter
  const isoMatters = await fetchJson("/api/matters?bucket=all", { cookieJar: isolationMp });
  let isoItems =
    (dataOf(isoMatters.body).items as Array<{ id: string; clientId: string }>) ?? [];

  if (isoItems.length === 0) {
    const isoClients = await fetchJson("/api/clients", { cookieJar: isolationMp });
    let isoClientItems =
      (dataOf(isoClients.body).items as Array<{ id: string }>) ?? [];
    if (isoClientItems.length === 0) {
      const created = await fetchJson("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cookieJar: isolationMp,
        body: JSON.stringify({
          clientType: "individual",
          fullName: "Isolation Portal Client",
        }),
      });
      check("Create isolation client", created.status === 200 || created.status === 201);
      const c = dataOf(created.body);
      const id = (c.client as Json | undefined)?.id ?? c.id;
      if (typeof id === "string") isoClientItems = [{ id }];
    }
    const clientId = isoClientItems[0]?.id;
    if (clientId) {
      const m = await fetchJson("/api/matters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cookieJar: isolationMp,
        body: JSON.stringify({
          clientId,
          title: "Isolation portal matter",
          areaOfLaw: "Civil",
          status: "open",
        }),
      });
      check("Create isolation matter", m.status === 200 || m.status === 201);
      isoMatters.body = m.body;
      isoItems =
        (dataOf(m.body).matter as { id: string; clientId: string } | undefined)
          ? [dataOf(m.body).matter as { id: string; clientId: string }]
          : ((dataOf(m.body).items as Array<{ id: string; clientId: string }>) ?? []);
      if (!isoItems[0] && dataOf(m.body).id) {
        isoItems = [
          {
            id: String(dataOf(m.body).id),
            clientId: String(dataOf(m.body).clientId ?? clientId),
          },
        ];
      }
    }
  }

  const isoMatter = isoItems[0];
  check("Isolation matter available", Boolean(isoMatter?.id));

  if (isoMatter) {
    const inviteB = await fetchJson("/api/portal/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cookieJar: isolationMp,
      body: JSON.stringify({
        clientId: isoMatter.clientId,
        email: "portal.share.b@example.local",
        fullName: "Portal Share B",
        password: "<set-in-env>",
        createMagicLink: false,
      }),
    });
    check("Invite portal user B (isolation)", inviteB.status === 200 && inviteB.body.ok === true);

    const shareB = await fetchJson("/api/portal/shares", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cookieJar: isolationMp,
      body: JSON.stringify({
        type: "matter",
        clientId: isoMatter.clientId,
        matterId: isoMatter.id,
        permission: "read",
      }),
    });
    check("Share isolation matter to B", shareB.status === 200 && shareB.body.ok === true);

    const portalB = await portalLogin("portal.share.b@example.local", "<set-in-env>");
    const bShares = await fetchJson("/api/portal/me/shares", { cookieJar: portalB });
    const bMatters = (dataOf(bShares.body).matters as Array<{ id: string }>) ?? [];
    check(
      "Portal B sees own firm share",
      bMatters.some((m) => m.id === isoMatter.id),
      `count=${bMatters.length}`,
    );
    check(
      "Portal B cannot see pilot firm matter",
      !bMatters.some((m) => m.id === matter.id),
    );

    const aAgain = await fetchJson("/api/portal/me/shares", { cookieJar: portalA });
    const aMatters = (dataOf(aAgain.body).matters as Array<{ id: string }>) ?? [];
    check(
      "Portal A cannot see isolation firm matter",
      !aMatters.some((m) => m.id === isoMatter.id),
    );
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
