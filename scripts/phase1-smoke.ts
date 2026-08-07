/**
 * Phase 1 automated smoke (P1-14).
 * Usage: npm run smoke:phase1
 * Requires: running app (SMOKE_BASE_URL), MP + junior + isolation users.
 */
import { config } from "dotenv";

config({ path: ".env.local" });

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";

type Json = Record<string, unknown>;

async function fetchJson(
  path: string,
  init?: RequestInit & { cookieJar?: Map<string, string> },
): Promise<{ status: number; body: Json; cookies: Map<string, string>; raw?: Response }> {
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
  if (ct.includes("application/json")) {
    const body = (await res.json().catch(() => ({}))) as Json;
    return { status: res.status, body, cookies: jar, raw: res };
  }
  return { status: res.status, body: {}, cookies: jar, raw: res };
}

async function login(email: string, password: string) {
  return fetchJson("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

function ok(label: string, pass: boolean, detail?: string) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  return pass;
}

async function main() {
  console.log(`Phase 1 smoke @ ${BASE}\n`);
  let passed = 0;
  let failed = 0;
  const record = (p: boolean) => (p ? (passed += 1) : (failed += 1));

  // 1. Login (local or Railway via SMOKE_BASE_URL)
  const mpLogin = await login("mp@lexzim.local", "<set-in-env>");
  record(ok("1. MP login", mpLogin.status === 200 && mpLogin.body.ok === true));
  if (mpLogin.status !== 200) {
    console.error("Cannot continue without MP session.");
    process.exit(1);
  }
  const jar = mpLogin.cookies;

  // 2. Create client → matter → procedure → timeline
  const stamp = Date.now();
  const clientRes = await fetchJson("/api/clients", {
    method: "POST",
    cookieJar: jar,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientType: "individual",
      fullName: `P1-14 Smoke Client ${stamp}`,
      email: `p114-${stamp}@example.zw`,
      phone: "+263 77 000 0014",
      physicalAddress: "1 Smoke Street, Harare",
    }),
  });
  const clientId = ((clientRes.body.data as Json)?.client as Json | undefined)?.id as string | undefined;
  record(ok("2a. Create client", clientRes.status === 201 && Boolean(clientId)));

  const matterRes = await fetchJson("/api/matters", {
    method: "POST",
    cookieJar: jar,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId,
      title: `P1-14 Smoke Matter ${stamp}`,
      areaOfLaw: "Civil",
      status: "open",
      courtName: "High Court of Zimbabwe, Harare",
    }),
  });
  const matterId = ((matterRes.body.data as Json)?.matter as Json | undefined)?.id as string | undefined;
  record(ok("2b. Create matter", matterRes.status === 201 && Boolean(matterId)));

  const procRes = await fetchJson(`/api/matters/${matterId}/procedures`, {
    method: "POST",
    cookieJar: jar,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "P1-14 Smoke procedure",
      dueAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      status: "todo",
    }),
  });
  record(ok("2c. Create procedure", procRes.status === 201 || procRes.status === 200));

  const noteRes = await fetchJson(`/api/matters/${matterId}/timeline`, {
    method: "POST",
    cookieJar: jar,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventType: "note",
      title: "P1-14 Smoke note",
      body: "Automated Phase 1 smoke timeline entry.",
    }),
  });
  record(ok("2d. Create timeline note", noteRes.status === 201 || noteRes.status === 200));

  // 3. Open/closed filters
  const openList = await fetchJson("/api/matters?bucket=open", { cookieJar: jar });
  const closedList = await fetchJson("/api/matters?bucket=closed", { cookieJar: jar });
  const openItems = ((openList.body.data as Json)?.items as Json[]) ?? [];
  const closedItems = ((closedList.body.data as Json)?.items as Json[]) ?? [];
  record(
    ok(
      "3. Open/closed filters",
      openList.status === 200 &&
        closedList.status === 200 &&
        openItems.some((m) => m.id === matterId) &&
        !closedItems.some((m) => m.id === matterId),
      `open=${openItems.length} closed=${closedItems.length}`,
    ),
  );

  // 4. Overdue on dashboard
  const dash = await fetchJson("/api/dashboard", { cookieJar: jar });
  const dashData = dash.body.data as Json | undefined;
  const overdueList = (dashData?.overdueProcedures as Json[] | undefined) ?? [];
  const overdueStat =
    typeof dashData?.stats === "object" && dashData.stats
      ? Number((dashData.stats as Json).overdueProcedures ?? 0)
      : 0;
  record(
    ok(
      "4. Overdue on dashboard",
      dash.status === 200 && (overdueStat > 0 || overdueList.length > 0),
      `stat=${overdueStat} list=${overdueList.length}`,
    ),
  );

  // 5. Upload document
  const form = new FormData();
  form.append(
    "file",
    new Blob([`P1-14 smoke upload ${stamp}`], { type: "text/plain" }),
    "p114-smoke.txt",
  );
  form.append("title", "P1-14 Smoke Upload");
  const cookieHeader = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  const uploadRes = await fetch(`${BASE}/api/matters/${matterId}/documents`, {
    method: "POST",
    headers: { cookie: cookieHeader },
    body: form,
  });
  const uploadBody = (await uploadRes.json().catch(() => ({}))) as Json;
  record(ok("5. Upload document", uploadRes.status === 201 || uploadRes.status === 200, `status=${uploadRes.status}`));

  // 6. Generate template docx
  const templates = await fetchJson("/api/templates?activeOnly=1", { cookieJar: jar });
  let templateItems = ((templates.body.data as Json)?.items as Json[]) ?? [];
  if (templateItems.length === 0) {
    await fetchJson("/api/templates", { method: "POST", cookieJar: jar });
    const again = await fetchJson("/api/templates?activeOnly=1", { cookieJar: jar });
    templateItems = ((again.body.data as Json)?.items as Json[]) ?? [];
  }
  const civilTpl = templateItems.find((t) => String(t.areaOfLaw).toLowerCase() === "civil") ?? templateItems[0];
  if (civilTpl?.id) {
    // approve if needed
    if (civilTpl.isApproved === false) {
      await fetchJson(`/api/templates/${civilTpl.id}/approve`, {
        method: "POST",
        cookieJar: jar,
      });
    }
    const gen = await fetchJson(`/api/matters/${matterId}/generate`, {
      method: "POST",
      cookieJar: jar,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId: civilTpl.id }),
    });
    record(ok("6. Generate template docx", gen.status === 201 || gen.status === 200, `status=${gen.status}`));
  } else {
    record(ok("6. Generate template docx", false, "no templates"));
  }

  // 7. Global search
  const search = await fetchJson(`/api/search?q=P1-14%20Smoke%20Client%20${stamp}`, {
    cookieJar: jar,
  });
  const searchClients = ((search.body.data as Json)?.clients as Json[]) ?? [];
  record(
    ok(
      "7. Global search",
      search.status === 200 && searchClients.some((c) => c.id === clientId),
      `clients=${searchClients.length}`,
    ),
  );

  // 8. Export archive
  const exportRes = await fetch(`${BASE}/api/export`, {
    method: "POST",
    headers: { cookie: cookieHeader },
  });
  const exportCt = exportRes.headers.get("content-type") ?? "";
  record(
    ok(
      "8. Export archive",
      exportRes.status === 200 && exportCt.includes("zip"),
      `status=${exportRes.status} ct=${exportCt}`,
    ),
  );
  await exportRes.arrayBuffer().catch(() => null);

  // 9. Junior Associate scoping
  const juniorLogin = await login("junior@lexzim.local", "<set-in-env>");
  record(ok("9a. Junior login", juniorLogin.status === 200));
  if (juniorLogin.status === 200) {
    const juniorGet = await fetchJson(`/api/matters/${matterId}`, {
      cookieJar: juniorLogin.cookies,
    });
    record(
      ok(
        "9b. Junior denied unassigned smoke matter",
        juniorGet.status === 403 || juniorGet.status === 404,
        `status=${juniorGet.status}`,
      ),
    );
  } else {
    record(ok("9b. Junior denied unassigned smoke matter", false, "junior login failed"));
  }

  // 10. Cross-firm isolation
  const isoLogin = await login("isolation@lexzim.local", "<set-in-env>");
  if (isoLogin.status === 200) {
    const isoClient = await fetchJson("/api/clients", {
      method: "POST",
      cookieJar: isoLogin.cookies,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientType: "individual",
        fullName: `P1-14 Iso ${stamp}`,
      }),
    });
    const isoClientId = ((isoClient.body.data as Json)?.client as Json | undefined)?.id as
      | string
      | undefined;
    const isoMatter = await fetchJson("/api/matters", {
      method: "POST",
      cookieJar: isoLogin.cookies,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: isoClientId,
        title: `P1-14 Iso Matter ${stamp}`,
        areaOfLaw: "Civil",
        status: "open",
      }),
    });
    const isoMatterId = ((isoMatter.body.data as Json)?.matter as Json | undefined)?.id as
      | string
      | undefined;
    const idor = await fetchJson(`/api/matters/${isoMatterId}`, { cookieJar: jar });
    record(
      ok(
        "10. Cross-firm isolation",
        Boolean(isoMatterId) && (idor.status === 403 || idor.status === 404),
        `status=${idor.status}`,
      ),
    );
  } else {
    record(ok("10. Cross-firm isolation", false, "isolation login failed — seed dev users"));
  }

  // 11. AI page still placeholder (HTML contains placeholder copy)
  const aiPage = await fetch(`${BASE}/ai`, { headers: { cookie: cookieHeader }, redirect: "follow" });
  const aiHtml = await aiPage.text();
  record(
    ok(
      "11. AI page still placeholder",
      aiPage.status === 200 && /placeholder/i.test(aiHtml),
      `status=${aiPage.status}`,
    ),
  );

  // silence unused
  void uploadBody;

  console.log(`\n${passed} passed, ${failed} failed`);
  console.log(
    failed === 0
      ? "\nPHASE 1 COMPLETE — ready for Phase 2 prompts (AI Legal Assistant: RAG, firm memory, drafting help)"
      : "\nPhase 1 smoke had failures — fix before Phase 2.",
  );
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
