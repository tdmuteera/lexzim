/**
 * Phase 1 RBAC / isolation smoke (P1-13).
 * Usage: npm run smoke:phase1-rbac
 * Requires: DEV_SEED_ENABLED users + isolation firm; app at SMOKE_BASE_URL.
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
  console.log(`Phase 1 RBAC smoke @ ${BASE}\n`);
  let passed = 0;
  let failed = 0;
  const record = (p: boolean) => (p ? (passed += 1) : (failed += 1));

  const isoLogin = await login("isolation@lexzim.local", "<set-in-env>");
  record(
    ok(
      "Isolation MP login",
      isoLogin.status === 200 && isoLogin.body.ok === true,
      isoLogin.status !== 200 ? JSON.stringify(isoLogin.body.error) : undefined,
    ),
  );
  if (isoLogin.status !== 200) {
    console.error("\nSeed isolation users: DEV_SEED_ENABLED=1 npm run db:seed:dev-users");
    process.exit(1);
  }

  const clientRes = await fetchJson("/api/clients", {
    method: "POST",
    cookieJar: isoLogin.cookies,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientType: "individual",
      fullName: "P1-13 Isolation Client",
      email: "isolation-client@example.test",
    }),
  });
  const isoClientId = ((clientRes.body.data as Json)?.client as Json | undefined)?.id as
    | string
    | undefined;
  record(ok("Isolation client create", clientRes.status === 201 && Boolean(isoClientId)));

  const matterRes = await fetchJson("/api/matters", {
    method: "POST",
    cookieJar: isoLogin.cookies,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId: isoClientId,
      title: "P1-13 Isolation Matter",
      areaOfLaw: "Civil",
      status: "open",
    }),
  });
  const isoMatterId = ((matterRes.body.data as Json)?.matter as Json | undefined)?.id as
    | string
    | undefined;
  record(ok("Isolation matter create", matterRes.status === 201 && Boolean(isoMatterId)));

  const pilotLogin = await login("mp@lexzim.local", "<set-in-env>");
  record(ok("Pilot MP login", pilotLogin.status === 200 && pilotLogin.body.ok === true));

  const idorMatter = await fetchJson(`/api/matters/${isoMatterId}`, {
    cookieJar: pilotLogin.cookies,
  });
  record(
    ok(
      "Cross-firm IDOR blocked (matter)",
      idorMatter.status === 404 || idorMatter.status === 403,
      `status=${idorMatter.status}`,
    ),
  );

  const idorClient = await fetchJson(`/api/clients/${isoClientId}`, {
    cookieJar: pilotLogin.cookies,
  });
  record(
    ok(
      "Cross-firm IDOR blocked (client)",
      idorClient.status === 404 || idorClient.status === 403,
      `status=${idorClient.status}`,
    ),
  );

  const juniorLogin = await login("junior@lexzim.local", "<set-in-env>");
  record(ok("Junior login", juniorLogin.status === 200 && juniorLogin.body.ok === true));

  const juniorMatters = await fetchJson("/api/matters?bucket=all", {
    cookieJar: juniorLogin.cookies,
  });
  const juniorItems =
    ((juniorMatters.body.data as Json)?.items as Json[] | undefined) ?? [];
  const juniorSeesIso = juniorItems.some((m) => m.id === isoMatterId);
  record(
    ok(
      "Junior list excludes other-firm matter",
      juniorMatters.status === 200 && !juniorSeesIso,
      `count=${juniorItems.length}`,
    ),
  );

  const pilotMatters = await fetchJson("/api/matters?bucket=all", {
    cookieJar: pilotLogin.cookies,
  });
  const pilotItems =
    ((pilotMatters.body.data as Json)?.items as Json[] | undefined) ?? [];
  const unassigned = pilotItems.find((m) => {
    // Prefer smoke matter if present; else any pilot matter
    return typeof m.id === "string";
  });
  if (unassigned?.id) {
    const juniorGet = await fetchJson(`/api/matters/${unassigned.id as string}`, {
      cookieJar: juniorLogin.cookies,
    });
    record(
      ok(
        "Junior denied unassigned pilot matter (or assigned OK)",
        juniorGet.status === 403 || juniorGet.status === 404 || juniorGet.status === 200,
        `status=${juniorGet.status}`,
      ),
    );
    // Stronger check: if junior is not on the matter, must be 403/404
    if (juniorGet.status === 200) {
      const matter = (juniorGet.body.data as Json)?.matter as Json | undefined;
      const juniorId = ((juniorLogin.body.data as Json)?.user as Json | undefined)?.id;
      const isResponsible = matter?.responsibleLawyerId === juniorId;
      record(
        ok(
          "Junior 200 only when assigned",
          Boolean(isResponsible),
          isResponsible ? "responsible" : "unexpected access",
        ),
      );
    } else {
      record(ok("Junior 200 only when assigned", true, "denied as expected"));
    }
  } else {
    record(ok("Junior denied unassigned pilot matter (or assigned OK)", false, "no pilot matters"));
    record(ok("Junior 200 only when assigned", false, "no pilot matters"));
  }

  const juniorExport = await fetchJson("/api/export", {
    method: "POST",
    cookieJar: juniorLogin.cookies,
  });
  record(
    ok(
      "Junior cannot export (settings.manage)",
      juniorExport.status === 403,
      `status=${juniorExport.status}`,
    ),
  );

  const audit = await fetchJson("/api/audit", { cookieJar: pilotLogin.cookies });
  const auditItems = ((audit.body.data as Json)?.items as Json[]) ?? [];
  const actions = new Set(auditItems.map((i) => i.action as string));
  const hasClientAudit = [...actions].some((a) => a.startsWith("clients."));
  const hasExportAudit = actions.has("export_created");
  record(
    ok(
      "Pilot audit excludes isolation firm writes",
      audit.status === 200 &&
        !auditItems.some(
          (i) =>
            i.entityId === isoMatterId ||
            i.entityId === isoClientId ||
            i.action === "dev.seed_isolation_marker",
        ),
    ),
  );
  record(
    ok(
      "Critical write audits present on pilot firm",
      hasClientAudit || hasExportAudit,
      `sample actions: ${[...actions].slice(0, 8).join(", ")}`,
    ),
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
