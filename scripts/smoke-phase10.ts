/**
 * Phase 10 closeout smoke (P10-16).
 * Usage: npm run smoke:phase10
 *
 * Static checks always run. API checks need a running app + SMOKE_MP_* credentials.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

config({ path: ".env.local" });

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const MP_EMAIL = process.env.SMOKE_MP_EMAIL ?? "mp@lexzim.local";
const MP_PASSWORD = process.env.SMOKE_MP_PASSWORD ?? "<set-in-env>";
const OTHER_EMAIL = process.env.SMOKE_OTHER_EMAIL?.trim() || "";
const OTHER_PASSWORD = process.env.SMOKE_OTHER_PASSWORD?.trim() || "";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

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

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
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
  function skip(name: string, reason: string) {
    console.log(`skip  ${name} (${reason})`);
  }

  console.log(`Phase 10 smoke against ${BASE}`);

  // 1) Idle timeout (source)
  const idleSrc = read("lib/auth/idle-timeout.ts");
  check(
    "Idle timeout STAFF_IDLE + 30min default",
    idleSrc.includes("STAFF_IDLE") &&
      idleSrc.includes("30 * 60 * 1000") &&
      idleSrc.includes("NEXT_PUBLIC_STAFF_IDLE_TIMEOUT_MS"),
  );
  const guardSrc = read("components/auth/IdleSessionGuard.tsx");
  check(
    "IdleSessionGuard uses STAFF_IDLE_TIMEOUT_MS",
    guardSrc.includes("STAFF_IDLE_TIMEOUT_MS") && guardSrc.includes("STAFF_IDLE_LOGOUT_REASON"),
  );

  // 2) Platform purge guard (source)
  const purgeSrc = read("app/api/platform/clients/purge/route.ts");
  check(
    "Platform client purge requires ops access",
    purgeSrc.includes("requireOpsAccess") && purgeSrc.includes("platformPurgeClient"),
  );

  // 5 fallback) Calendar private default (source)
  const calValSrc = read("lib/calendar/validation.ts");
  check(
    "Calendar visibility defaults to private",
    calValSrc.includes('visibility: CalendarVisibility = "private"') ||
      calValSrc.includes('let visibility: CalendarVisibility = "private"'),
  );

  // 6 source) Email must not hardcode pilot From
  const emailDirFiles = ["lib/email/config.ts", "lib/email/mailer.ts"];
  let emailHardcode = false;
  for (const f of emailDirFiles) {
    const src = read(f);
    if (src.includes("info@tpfiguattorneys.com")) emailHardcode = true;
  }
  check("lib/email does not hardcode info@tpfiguattorneys.com", !emailHardcode);

  let mp: Map<string, string>;
  try {
    mp = await login(MP_EMAIL, MP_PASSWORD);
  } catch (err) {
    console.error(err);
    console.error(
      "\nAPI checks need a running app and valid SMOKE_MP_EMAIL / SMOKE_MP_PASSWORD. Static checks above still apply.",
    );
    if (failed) {
      console.error(`\n${failed} check(s) failed.`);
      process.exit(1);
    }
    console.log("\nPhase 10 static smoke passed (API skipped: login failed).");
    process.exit(0);
  }

  const meRes = await fetchJson("/api/auth/me", { cookieJar: mp });
  const me = dataOf(meRes.body).user as Json | undefined;
  const mpId = typeof me?.id === "string" ? me.id : "";
  check("MP session", Boolean(mpId));

  // 3) Invoice approvalState + optional workDate
  const invList = await fetchJson("/api/invoices", { cookieJar: mp });
  check("Invoices list 200", invList.status === 200 && invList.body.ok === true);
  const invItems = (dataOf(invList.body).items as Json[] | undefined) ?? [];
  if (invItems.length > 0) {
    const first = invItems[0];
    check("Invoice list item has approvalState", typeof first.approvalState === "string");
    const invId = typeof first.id === "string" ? first.id : "";
    if (invId) {
      const detail = await fetchJson(`/api/invoices/${invId}`, { cookieJar: mp });
      check("Invoice detail 200", detail.status === 200 && detail.body.ok === true);
      const inv = dataOf(detail.body).invoice as Json | undefined;
      check("Invoice detail has approvalState", typeof inv?.approvalState === "string");
      const lines = (dataOf(detail.body).lines as Json[] | undefined) ?? [];
      if (lines.length > 0) {
        check(
          "Invoice line exposes workDate field (optional)",
          Object.prototype.hasOwnProperty.call(lines[0], "workDate"),
        );
      } else {
        skip("Invoice line workDate", "no lines on sample invoice");
      }
    }
  } else {
    skip("Invoice approvalState / workDate", "no invoices in firm; create one for full check");
  }

  // 4) Tasks create + complete
  if (mpId) {
    const created = await fetchJson("/api/workflow/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `P10 smoke task ${Date.now().toString(36)}`,
        description: "Phase 10 smoke",
        assigneeUserId: mpId,
        priority: "normal",
      }),
      cookieJar: mp,
    });
    check("Task create 201/200", created.status === 201 || created.status === 200);
    check("Task create ok", created.body.ok === true);
    const task = dataOf(created.body).task as Json | undefined;
    const taskId = typeof task?.id === "string" ? task.id : "";
    if (taskId) {
      const done = await fetchJson(`/api/workflow/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete", feedback: "P10 smoke complete" }),
        cookieJar: mp,
      });
      check("Task complete 200", done.status === 200 && done.body.ok === true);
    } else {
      skip("Task complete", "create did not return task id");
    }
  }

  // 5) Calendar privacy (API)
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 3);
  const end = new Date(start);
  end.setHours(end.getHours() + 1);
  const privateTitle = `P10 private ${Date.now().toString(36)}`;
  const cal = await fetchJson("/api/calendar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventType: "other",
      title: privateTitle,
      location: "Smoke room",
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      allDay: false,
      visibility: "private",
    }),
    cookieJar: mp,
  });
  check("Private calendar create 201/200", cal.status === 201 || cal.status === 200);
  check("Private calendar create ok", cal.body.ok === true);
  const createdEvent = dataOf(cal.body).event as Json | undefined;
  const eventId = typeof createdEvent?.id === "string" ? createdEvent.id : "";
  if (createdEvent) {
    check("Created event visibility private", createdEvent.visibility === "private");
  } else {
    check("Created event returned", false);
  }

  if (OTHER_EMAIL && OTHER_PASSWORD) {
    try {
      const other = await login(OTHER_EMAIL, OTHER_PASSWORD);
      const from = new Date(start);
      from.setHours(from.getHours() - 1);
      const to = new Date(end);
      to.setHours(to.getHours() + 1);
      const qs = `from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
      const firmList = await fetchJson(`/api/calendar?scope=firm&${qs}`, { cookieJar: other });
      const sharedList = await fetchJson(`/api/calendar?scope=shared&${qs}`, { cookieJar: other });
      const firmItems = (dataOf(firmList.body).items as Json[] | undefined) ?? [];
      const sharedItems = (dataOf(sharedList.body).items as Json[] | undefined) ?? [];
      const leak =
        firmItems.some((i) => i.id === eventId || i.title === privateTitle) ||
        sharedItems.some((i) => i.id === eventId || i.title === privateTitle);
      check("Other user firm/shared scopes hide private event", !leak);
    } catch (err) {
      skip(
        "Other-user calendar privacy",
        `SMOKE_OTHER login failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  } else {
    skip(
      "Other-user calendar privacy",
      "set SMOKE_OTHER_EMAIL and SMOKE_OTHER_PASSWORD for cross-user assert",
    );
  }

  // 6) Email From from firm settings
  const emailCfg = await fetchJson("/api/settings/email", { cookieJar: mp });
  if (emailCfg.status === 200 && emailCfg.body.ok === true) {
    const cfg = dataOf(emailCfg.body).config as Json | undefined;
    check("Email settings expose fromEmail string", typeof cfg?.fromEmail === "string");
  } else if (emailCfg.status === 403) {
    skip("Email settings GET", "MP lacks settings.manage");
  } else {
    check("Email settings GET 200", false);
  }

  // 7) HR advances + payroll paths
  const advances = await fetchJson("/api/hr/salary-advances", { cookieJar: mp });
  check("Salary advances GET 200", advances.status === 200 && advances.body.ok === true);
  const periods = await fetchJson("/api/hr/payroll/periods", { cookieJar: mp });
  check("Payroll periods GET 200", periods.status === 200 && periods.body.ok === true);

  if (failed) {
    console.error(`\n${failed} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nPhase 10 closeout smoke passed.");
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
