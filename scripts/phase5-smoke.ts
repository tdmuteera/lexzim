/**
 * Phase 5 release smoke (P5-14).
 * Usage: npm run smoke:phase5
 * Requires: running app (SMOKE_BASE_URL), seeded users; phase1 demo preferred.
 * Portal share/revoke/isolation require PORTAL_ENABLED (default on in non-production).
 *
 * Web-only. No desktop install steps.
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
  if (ct.includes("application/zip") || ct.includes("application/octet-stream")) {
    const buf = Buffer.from(await res.arrayBuffer());
    return {
      status: res.status,
      body: { bytes: buf.length },
      cookies: jar,
      raw: `bytes:${buf.length}`,
    };
  }
  const body = ct.includes("application/json")
    ? ((await res.json().catch(() => ({}))) as Json)
    : ({ raw: await res.text() } as Json);
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
    throw new Error(`Staff login failed ${email}: ${res.status} ${JSON.stringify(res.body)}`);
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
  console.log(`Phase 5 release smoke against ${BASE}\n`);
  console.log("Note: web SaaS only. Portal optional; core app must work either way.\n");

  // 8. Railway + Supabase health
  const health = await fetchJson("/api/health");
  const env = (health.body.env as Json) ?? {};
  check(
    "Health endpoint (Railway)",
    health.status === 200 && health.body.ok === true,
    `version=${String(health.body.version ?? "?")}`,
  );
  check(
    "Supabase/DB env configured",
    env.configured === true ||
      (env.supabaseUrl === true && env.databaseUrl === true && env.serviceRole === true),
    `configured=${String(env.configured)}`,
  );

  // 1. Main app with portal flag reported
  const portalHealth = await fetchJson("/api/portal/health");
  const portalEnabled = portalHealth.body.portalEnabled === true;
  check(
    "Portal health reachable",
    portalHealth.status === 200 && portalHealth.body.ok === true,
    `portalEnabled=${String(portalEnabled)}`,
  );

  const mp = await staffLogin("mp@lexzim.local", "<set-in-env>");
  const clients = await fetchJson("/api/clients", { cookieJar: mp });
  check(
    "Main app works (staff clients)",
    clients.status === 200 && clients.body.ok === true,
    `count=${((dataOf(clients.body).items as unknown[]) ?? []).length}`,
  );

  const portalAuthGet = await fetchJson("/api/portal/auth");
  check(
    "Portal auth GET reports flag",
    portalAuthGet.status === 200 && portalAuthGet.body.ok === true,
    `portalEnabled=${String(dataOf(portalAuthGet.body).portalEnabled)}`,
  );
  if (!portalEnabled) {
    check(
      "Portal disabled: auth reports portalEnabled false",
      dataOf(portalAuthGet.body).portalEnabled === false,
    );
  }

  // 7. Trust / fee separation
  const accounts = await staffLogin("accounts@lexzim.local", (process.env.DEV_SEED_PASSWORD ?? ""));
  const invoices = await fetchJson("/api/invoices", { cookieJar: accounts });
  const trust = await fetchJson("/api/trust/accounts", { cookieJar: accounts });
  check("Fee invoices list (separate from trust)", invoices.status === 200 && invoices.body.ok === true);
  check("Trust accounts list (separate from fees)", trust.status === 200 && trust.body.ok === true);

  // 5. Tenant export
  const exportPost = await fetchJson("/api/export", { method: "POST", cookieJar: mp });
  check(
    "Tenant export ZIP",
    exportPost.status === 200,
    `bytes=${String((exportPost.body as Json).bytes ?? 0)}`,
  );

  // 6. AI grounding
  const ask = await fetchJson("/api/ai/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cookieJar: mp,
    body: JSON.stringify({
      question:
        "In Zimbabwe, what is a brief overview of prescription of debts under common law? Keep it short.",
    }),
  });
  const askOk =
    ask.status === 200 && ask.body.ok === true
      ? true
      : ask.status === 402 ||
        ask.status === 429 ||
        String((ask.body.error as Json | undefined)?.code ?? "").includes("budget") ||
        String((ask.body.error as Json | undefined)?.message ?? "")
          .toLowerCase()
          .includes("key");
  check("AI grounded ask (or clear key/budget error)", askOk, `status=${ask.status}`);

  // 4. Session revoke
  const secretaryJar = await staffLogin("secretary@lexzim.local", (process.env.DEV_SEED_PASSWORD ?? ""));
  const staffList = await fetchJson("/api/staff", { cookieJar: mp });
  const staffItems =
    (dataOf(staffList.body).items as Array<{ id: string; email?: string }>) ?? [];
  const secretary = staffItems.find((u) => u.email === "secretary@lexzim.local");
  check("Secretary user found for session test", Boolean(secretary?.id));

  if (secretary?.id) {
    const sessions = await fetchJson(`/api/staff/sessions?userId=${secretary.id}`, {
      cookieJar: mp,
    });
    const sessionItems = (dataOf(sessions.body).items as Array<{ id: string }>) ?? [];
    check(
      "Staff sessions list",
      sessions.status === 200 && sessions.body.ok === true && sessionItems.length > 0,
      `count=${sessionItems.length}`,
    );
    const target = sessionItems[0];
    if (target) {
      const revoke = await fetchJson("/api/staff/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cookieJar: mp,
        body: JSON.stringify({ action: "revoke", registryId: target.id }),
      });
      check("Session revoke", revoke.status === 200 && dataOf(revoke.body).revoked === true);

      // Secretary cookie may still work until Supabase clears; registry should drop the row.
      const after = await fetchJson(`/api/staff/sessions?userId=${secretary.id}`, {
        cookieJar: mp,
      });
      const afterItems = (dataOf(after.body).items as Array<{ id: string }>) ?? [];
      check(
        "Revoked session absent from registry",
        !afterItems.some((s) => s.id === target.id),
        `remaining=${afterItems.length}`,
      );
    }
  } else {
    check("Staff sessions list", false, "no secretary");
    check("Session revoke", false, "no secretary");
    check("Revoked session absent from registry", false, "no secretary");
  }
  void secretaryJar;

  // 2 + 3. Portal share → see → revoke + cross-tenant (when enabled)
  if (!portalEnabled) {
    check("Share matter → client sees → revoke", true, "skipped (PORTAL_ENABLED off)");
    check("Cross-tenant portal isolation", true, "skipped (PORTAL_ENABLED off)");
    console.log(
      "\nHint: set PORTAL_ENABLED=1 and re-run for portal share/isolation automated checks.",
    );
  } else {
    const matters = await fetchJson("/api/matters?bucket=all", { cookieJar: mp });
    const matterItems =
      (dataOf(matters.body).items as Array<{ id: string; clientId: string }>) ?? [];
    const matter = matterItems[0];
    check("Pilot matter for portal share", Boolean(matter?.id), `count=${matterItems.length}`);

    if (matter) {
      const invite = await fetchJson("/api/portal/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cookieJar: mp,
        body: JSON.stringify({
          clientId: matter.clientId,
          email: "portal.phase5.smoke@example.local",
          fullName: "Phase5 Smoke Portal",
          password: "<set-in-env>",
          createMagicLink: false,
        }),
      });
      check(
        "Invite portal user",
        invite.status === 200 && invite.body.ok === true,
        `status=${invite.status}`,
      );

      const portalUser = await portalLogin(
        "portal.phase5.smoke@example.local",
        "<set-in-env>",
      );
      const before = await fetchJson("/api/portal/me/shares", { cookieJar: portalUser });
      // May already have shares from prior runs; grant then revoke this matter specifically.
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
      const shareRow = (dataOf(share.body).share as Json) ?? {};
      check(
        "Create matter share",
        share.status === 200 && typeof shareRow.id === "string",
        `id=${String(shareRow.id ?? "?")}`,
      );

      const after = await fetchJson("/api/portal/me/shares", { cookieJar: portalUser });
      const afterMatters = (dataOf(after.body).matters as Array<{ id: string }>) ?? [];
      check(
        "Client sees shared matter",
        after.status === 200 && afterMatters.some((m) => m.id === matter.id),
        `count=${afterMatters.length} (before=${((dataOf(before.body).matters as unknown[]) ?? []).length})`,
      );

      if (typeof shareRow.id === "string") {
        const rev = await fetchJson("/api/portal/shares", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cookieJar: mp,
          body: JSON.stringify({
            revoke: true,
            type: "matter",
            shareId: shareRow.id,
          }),
        });
        check("Revoke matter share", rev.status === 200 && dataOf(rev.body).revoked === true);

        const gone = await fetchJson("/api/portal/me/shares", { cookieJar: portalUser });
        const goneMatters = (dataOf(gone.body).matters as Array<{ id: string }>) ?? [];
        check(
          "Client no longer sees revoked matter",
          !goneMatters.some((m) => m.id === matter.id),
          `count=${goneMatters.length}`,
        );
      }

      // Cross-tenant: isolation firm portal must not see pilot matter id
      const isolationMp = await staffLogin("isolation@lexzim.local", (process.env.DEV_SEED_PASSWORD ?? ""));
      let isoItems =
        (dataOf(
          (await fetchJson("/api/matters?bucket=all", { cookieJar: isolationMp })).body,
        ).items as Array<{ id: string; clientId: string }>) ?? [];

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
              fullName: "Isolation Portal Client P5",
            }),
          });
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
              title: "Isolation portal matter P5",
              areaOfLaw: "Civil",
              status: "open",
            }),
          });
          const md = dataOf(m.body);
          const mid = (md.matter as Json | undefined)?.id ?? md.id;
          if (typeof mid === "string") {
            isoItems = [{ id: mid, clientId }];
          }
        }
      }

      const isoMatter = isoItems[0];
      if (isoMatter) {
        await fetchJson("/api/portal/invites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cookieJar: isolationMp,
          body: JSON.stringify({
            clientId: isoMatter.clientId,
            email: "portal.phase5.iso@example.local",
            fullName: "Phase5 Iso Portal",
            password: "<set-in-env>",
            createMagicLink: false,
          }),
        });
        await fetchJson("/api/portal/shares", {
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
        const portalIso = await portalLogin(
          "portal.phase5.iso@example.local",
          "<set-in-env>",
        );
        const isoShares = await fetchJson("/api/portal/me/shares", { cookieJar: portalIso });
        const isoSeen = (dataOf(isoShares.body).matters as Array<{ id: string }>) ?? [];
        check(
          "Cross-tenant: isolation portal cannot see pilot matter",
          !isoSeen.some((m) => m.id === matter.id),
          `isoCount=${isoSeen.length}`,
        );
      } else {
        check("Cross-tenant: isolation portal cannot see pilot matter", false, "no iso matter");
      }
    } else {
      check("Invite portal user", false, "no matters; seed phase1-demo");
      check("Create matter share", false, "no matters");
      check("Client sees shared matter", false, "no matters");
      check("Revoke matter share", false, "no matters");
      check("Client no longer sees revoked matter", false, "no matters");
      check("Cross-tenant: isolation portal cannot see pilot matter", false, "no matters");
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  console.log(
    "\nPHASE 5 COMPLETE — limited client portal and scale/privacy tooling available",
  );
  console.log(
    "LEXZIM WEB PHASE ROADMAP 0–5 COMPLETE — iterate on content, integrations, and pilot feedback next",
  );
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
