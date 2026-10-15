/**
 * Phase 0 local smoke checks (P0-11).
 * Usage: npm run smoke:phase0
 * Requires dev server at BASE_URL (default http://localhost:3000).
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

async function login(email: string, password: string) {
  return fetchJson("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

function ok(label: string, pass: boolean, detail?: string) {
  const mark = pass ? "PASS" : "FAIL";
  console.log(`${mark}  ${label}${detail ? ` — ${detail}` : ""}`);
  return pass;
}

async function main() {
  console.log(`Phase 0 smoke @ ${BASE}\n`);
  let passed = 0;
  let failed = 0;

  const record = (p: boolean) => (p ? (passed += 1) : (failed += 1));

  const health = await fetchJson("/api/health");
  record(ok("GET /api/health", health.status === 200 && health.body.ok === true));

  const db = await fetchJson("/api/db-status");
  record(
    ok(
      "GET /api/db-status",
      db.status === 200 && db.body.connected === true,
    ),
  );

  const mpLogin = await login("mp@lexzim.local", "<set-in-env>");
  record(
    ok(
      "MP login",
      mpLogin.status === 200 && mpLogin.body.ok === true,
      mpLogin.status !== 200 ? String(mpLogin.body.error) : undefined,
    ),
  );

  const mpMe = await fetchJson("/api/auth/me", { cookieJar: mpLogin.cookies });
  const mpUser = (mpMe.body.data as { user?: { role?: { code?: string } } } | undefined)?.user;
  record(
    ok(
      "MP session",
      mpMe.status === 200 && mpUser?.role?.code === "managing_partner",
    ),
  );

  const mpAudit = await fetchJson("/api/audit", { cookieJar: mpLogin.cookies });
  const auditItems = ((mpAudit.body.data as Json)?.items as Json[]) ?? [];
  const auditActions = auditItems.map((i) => i.action as string);
  const isolationMarkerLeaked = auditActions.includes("dev.seed_isolation_marker");
  record(
    ok(
      "Tenant isolation (MP audit excludes other firm marker)",
      mpAudit.status === 200 && !isolationMarkerLeaked,
      isolationMarkerLeaked ? "isolation marker visible to pilot MP" : `${auditItems.length} rows`,
    ),
  );

  const mpLogout = await fetchJson("/api/auth/logout", {
    method: "POST",
    cookieJar: mpLogin.cookies,
  });
  record(ok("MP logout", mpLogout.status === 200 && mpLogout.body.ok === true));

  const secretaryLogin = await login("secretary@lexzim.local", (process.env.DEV_SEED_PASSWORD ?? ""));
  record(
    ok(
      "Secretary login",
      secretaryLogin.status === 200,
      secretaryLogin.status !== 200 ? "run DEV_SEED_ENABLED=1 npm run db:seed:dev-users" : undefined,
    ),
  );

  if (secretaryLogin.status === 200) {
    const secAudit = await fetchJson("/api/audit", { cookieJar: secretaryLogin.cookies });
    record(ok("Secretary forbidden on /api/audit", secAudit.status === 403));

    const secMe = await fetchJson("/api/auth/me", { cookieJar: secretaryLogin.cookies });
    const perms = ((secMe.body.data as Json)?.user as Json)?.permissions as string[] | undefined;
    record(
      ok(
        "Secretary has ai.use",
        Array.isArray(perms) && perms.includes("ai.use"),
      ),
    );
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
