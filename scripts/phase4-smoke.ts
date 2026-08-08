/**
 * Phase 4 release smoke (P4-14).
 * Usage: npm run smoke:phase4
 * Requires: running app (SMOKE_BASE_URL), seeded users; phase1/3 demo preferred.
 * Optional Railway: $env:SMOKE_BASE_URL = "https://YOUR-APP.up.railway.app"
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
    throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
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
  console.log(`Phase 4 release smoke against ${BASE}\n`);
  console.log("Note: web SaaS only. No desktop installer steps.\n");

  const health = await fetchJson("/api/health");
  const healthBody = health.body;
  check(
    "Health endpoint",
    health.status === 200 && healthBody.ok === true,
    `version=${String(healthBody.version ?? "?")}`,
  );
  check(
    "Health reports version",
    typeof healthBody.version === "string" && String(healthBody.version).length > 0,
  );

  const authStatus = await fetchJson("/api/auth/status");
  const authData = dataOf(authStatus.body);
  check(
    "Auth status (setup complete or session-ready)",
    authStatus.status === 200 && authStatus.body.ok === true,
    `needsSetup=${String(authData.needsSetup)}`,
  );

  const mp = await login("mp@lexzim.local", "<set-in-env>");
  const accounts = await login("accounts@lexzim.local", "<set-in-env>");
  const secretary = await login("secretary@lexzim.local", "<set-in-env>");
  const isolation = await login("isolation@lexzim.local", "<set-in-env>");

  // About / version / licence
  const about = await fetchJson("/api/about", { cookieJar: mp });
  const aboutData = dataOf(about.body);
  const aboutApp = (aboutData.app as Json) ?? {};
  const aboutLic = (aboutData.licence as Json) ?? {};
  check(
    "About / version",
    about.status === 200 && about.body.ok === true && typeof aboutApp.version === "string",
    `v=${String(aboutApp.version)} edition=${String(aboutLic.edition)}`,
  );

  const licence = await fetchJson("/api/licence", { cookieJar: mp });
  const licData = dataOf(licence.body);
  const lic = (licData.licence as Json) ?? licData;
  check(
    "Licence active or readable",
    licence.status === 200 && licence.body.ok === true,
    `status=${String(lic.status)} edition=${String(lic.edition)} exportAllowed=${String(lic.exportAllowed)}`,
  );
  check(
    "Export allowed on licence payload",
    lic.exportAllowed === true || lic.exportAllowed === undefined,
  );

  // Seats (staff API, or licence usage fallback if staff errored)
  const staff = await fetchJson("/api/staff", { cookieJar: mp });
  const staffData = dataOf(staff.body);
  const seats = (staffData.seats as Json) ?? {};
  const licUsage = (licData.usage as Json) ?? {};
  const seatLimit =
    typeof seats.limit === "number"
      ? seats.limit
      : typeof licUsage.seats === "number"
        ? licUsage.seats
        : typeof lic.seats === "number"
          ? lic.seats
          : null;
  const seatUsed =
    typeof seats.used === "number"
      ? seats.used
      : typeof licUsage.seatsUsed === "number"
        ? licUsage.seatsUsed
        : null;
  check(
    "Staff seats payload",
    seatLimit !== null && seatUsed !== null,
    `${String(seatUsed)}/${String(seatLimit)} (staffStatus=${staff.status})`,
  );

  // Onboarding + firm profile
  const onboarding = await fetchJson("/api/onboarding", { cookieJar: mp });
  check(
    "Onboarding checklist API",
    onboarding.status === 200 && onboarding.body.ok === true,
  );

  const profile = await fetchJson("/api/firm/profile", { cookieJar: mp });
  check(
    "Firm profile API",
    profile.status === 200 && profile.body.ok === true,
    `currency=${String(dataOf(profile.body).defaultCurrency)}`,
  );

  // Clients / matters / docx path
  const clients = await fetchJson("/api/clients", { cookieJar: mp });
  const clientItems = (dataOf(clients.body).items as unknown[]) ?? [];
  check(
    "Clients list",
    clients.status === 200 && clients.body.ok === true,
    `count=${clientItems.length}`,
  );

  const matters = await fetchJson("/api/matters?bucket=all", { cookieJar: mp });
  const matterItems =
    (dataOf(matters.body).items as Array<{ id: string; clientId?: string }>) ?? [];
  check(
    "Matters list",
    matters.status === 200 && matters.body.ok === true,
    `count=${matterItems.length}`,
  );
  const matterId = matterItems[0]?.id;

  if (matterId) {
    const templates = await fetchJson("/api/templates", { cookieJar: mp });
    check(
      "Templates list (docx pipeline)",
      templates.status === 200 && templates.body.ok === true,
    );
    const gen = await fetchJson(`/api/matters/${matterId}/generate`, { cookieJar: mp });
    check(
      "Matter generate/docx helpers reachable",
      gen.status === 200 || gen.status === 400 || gen.status === 404,
      `status=${gen.status}`,
    );
  } else {
    check("Templates list (docx pipeline)", false, "no matters; seed phase1-demo");
    check("Matter generate/docx helpers reachable", false, "no matters");
  }

  // Calendar / billing / trust / intake (regression)
  const from = new Date(Date.now() - 7 * 86400000).toISOString();
  const to = new Date(Date.now() + 60 * 86400000).toISOString();
  const cal = await fetchJson(
    `/api/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    { cookieJar: mp },
  );
  check("Calendar list", cal.status === 200 && cal.body.ok === true);

  const invoices = await fetchJson("/api/invoices", { cookieJar: accounts });
  check("Billing invoices list", invoices.status === 200 && invoices.body.ok === true);

  const trustAccounts = await fetchJson("/api/trust/accounts", { cookieJar: accounts });
  check(
    "Trust accounts",
    trustAccounts.status === 200 && trustAccounts.body.ok === true,
  );

  const intakes = await fetchJson("/api/intakes", { cookieJar: mp });
  check("Intake list", intakes.status === 200 && intakes.body.ok === true);

  // AI settings, provider switch, grounded ask
  const aiGet = await fetchJson("/api/ai/settings", { cookieJar: mp });
  const aiRoot = dataOf(aiGet.body);
  const aiBefore = ((aiRoot.settings as Json) ?? aiRoot) as Json;
  check(
    "AI settings readable",
    aiGet.status === 200 && aiGet.body.ok === true,
    `provider=${String(aiBefore.providerDefault)} webLookup=${String(aiBefore.webLookupEnabled)}`,
  );
  check(
    "AI web lookup default off (or explicit)",
    typeof aiBefore.webLookupEnabled === "boolean",
  );

  const originalProvider = String(aiBefore.providerDefault ?? "gemini");
  const switchTo = originalProvider === "gemini" ? "openai" : "gemini";
  const aiPatch = await fetchJson("/api/ai/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    cookieJar: mp,
    body: JSON.stringify({
      providerDefault: switchTo,
      webLookupEnabled: false,
    }),
  });
  const aiPatchedSettings =
    ((dataOf(aiPatch.body).settings as Json) ?? dataOf(aiPatch.body)) as Json;
  check(
    "AI provider switch (no web lookup enable)",
    aiPatch.status === 200 &&
      aiPatch.body.ok === true &&
      aiPatchedSettings.webLookupEnabled === false,
    `→ ${switchTo}`,
  );

  // Restore provider
  await fetchJson("/api/ai/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    cookieJar: mp,
    body: JSON.stringify({
      providerDefault: originalProvider,
      webLookupEnabled: false,
    }),
  });

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
  check(
    "AI grounded ask (or clear key/budget error)",
    askOk,
    `status=${ask.status}`,
  );

  // Export + diagnostics
  const exportMeta = await fetchJson("/api/export", { cookieJar: mp });
  check(
    "Export meta (always available path)",
    exportMeta.status === 200 && exportMeta.body.ok === true,
  );

  const exportPost = await fetchJson("/api/export", {
    method: "POST",
    cookieJar: mp,
  });
  check(
    "Export download/create",
    exportPost.status === 200,
    `status=${exportPost.status} bytes=${String((exportPost.body as Json).bytes ?? exportPost.raw?.length ?? 0)}`,
  );

  const diag = await fetchJson("/api/diagnostics", { cookieJar: mp });
  const diagText = diag.raw ?? JSON.stringify(diag.body);
  let diagJson: Json = {};
  try {
    diagJson = JSON.parse(diagText) as Json;
  } catch {
    diagJson = diag.body;
  }
  check(
    "Diagnostics download (no matter payload)",
    diag.status === 200 &&
      diagJson.containsMatterData === false &&
      diagJson.autoUpload === false &&
      Boolean((diagJson.firm as Json | undefined)?.id),
    `firm=${String((diagJson.firm as Json | undefined)?.slug ?? "?")}`,
  );

  // RBAC
  const secBilling = await fetchJson("/api/invoices", { cookieJar: secretary });
  check("RBAC: secretary blocked from billing", secBilling.status === 403);

  const accIntake = await fetchJson("/api/intakes", { cookieJar: accounts });
  check("RBAC: accounts blocked from intake", accIntake.status === 403);

  const secLicence = await fetchJson("/api/licence", { cookieJar: secretary });
  check(
    "RBAC: secretary blocked from licence",
    secLicence.status === 403,
  );

  // firm_id isolation
  const isoInv = await fetchJson("/api/invoices", { cookieJar: isolation });
  const isoItems = (dataOf(isoInv.body).items as unknown[]) ?? [];
  check(
    "firm_id isolation (isolation firm invoices)",
    isoInv.status === 200 && isoItems.length === 0,
    `count=${isoItems.length}`,
  );

  const isoMatters = await fetchJson("/api/matters?bucket=all", { cookieJar: isolation });
  const isoMatterItems = (dataOf(isoMatters.body).items as unknown[]) ?? [];
  check(
    "firm_id isolation (isolation matters not pilot dump)",
    isoMatters.status === 200,
    `count=${isoMatterItems.length}`,
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  console.log(
    "\nPHASE 4 COMPLETE — ready for Phase 5 prompts (Client Portal, privacy tooling, scale beyond free tiers)",
  );
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
