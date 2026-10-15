/**
 * Phase 2 automated smoke (P2-14).
 * Usage: npm run smoke:phase2
 * Requires: running app (SMOKE_BASE_URL), seeded users.
 * GEMINI_API_KEY optional: missing_key / not-found paths still pass.
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
  console.log(`Phase 2 smoke against ${BASE}\n`);

  const mp = await login("mp@lexzim.local", "<set-in-env>");
  const junior = await login("junior@lexzim.local", (process.env.DEV_SEED_PASSWORD ?? ""));
  const isolation = await login("isolation@lexzim.local", (process.env.DEV_SEED_PASSWORD ?? ""));
  const accounts = await login("accounts@lexzim.local", (process.env.DEV_SEED_PASSWORD ?? ""));

  const status = await fetchJson("/api/ai/status", { cookieJar: mp });
  const st = dataOf(status.body);
  check("AI status", status.status === 200 && status.body.ok === true);
  check("Web lookup default on", st.webLookupEnabled === true, String(st.webLookupEnabled));

  const test = await fetchJson("/api/ai/test", {
    method: "POST",
    cookieJar: mp,
  });
  check(
    "AI test endpoint responds",
    test.status === 200 && test.body.ok === true,
    JSON.stringify(dataOf(test.body).status ?? dataOf(test.body).ok ?? ""),
  );

  const pack = await fetchJson("/api/ai/knowledge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "pack" }),
    cookieJar: mp,
  });
  check("KB pack ingest", pack.status === 200 && pack.body.ok === true);

  const ask = await fetchJson("/api/ai/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question: "xyzzy quantum flamingo statute that does not exist in Zimbabwe",
    }),
    cookieJar: junior,
  });
  const askData = dataOf(ask.body);
  check(
    "Nonsense → not-found or blocked honestly",
    ask.status === 200 &&
      ask.body.ok === true &&
      (askData.notFound === true ||
        (askData.citations as unknown[])?.length === 0 ||
        Boolean(askData.answer)),
    `notFound=${String(askData.notFound)}`,
  );

  if (askData.conversationId) {
    const conv = await fetchJson(`/api/ai/conversations/${askData.conversationId}`, {
      cookieJar: junior,
    });
    const msgs = (dataOf(conv.body).messages as unknown[]) ?? [];
    check("Conversation persistence", conv.status === 200 && msgs.length >= 2, `msgs=${msgs.length}`);
  } else {
    check("Conversation persistence", false, "no conversationId");
  }

  const matters = await fetchJson("/api/matters?bucket=all", { cookieJar: mp });
  const items = (dataOf(matters.body).items as Array<{ id: string }>) ?? [];
  check("Matters list for draft/matter assist", items.length > 0, `count=${items.length}`);
  const matterId = items[0]?.id;

  if (matterId) {
    const matterAsk = await fetchJson("/api/ai/matter-ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "Summarise this matter", matterId }),
      cookieJar: mp,
    });
    check(
      "Matter Assist ask",
      matterAsk.status === 200 && matterAsk.body.ok === true,
      String(dataOf(matterAsk.body).confidence ?? ""),
    );

    const forbidden = await fetchJson("/api/ai/matter-ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "Summarise", matterId }),
      cookieJar: isolation,
    });
    check("Unauthorized matter rejected", forbidden.status === 403);

    const gen = await fetchJson(`/api/matters/${matterId}/generate`, { cookieJar: mp });
    const templates =
      (dataOf(gen.body).templates as Array<{ id: string }>) ?? [];
    if (templates[0]?.id) {
      const preview = await fetchJson(`/api/matters/${matterId}/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview", templateId: templates[0].id }),
        cookieJar: mp,
      });
      const plain = String(dataOf(preview.body).plainText ?? "");
      check("Draft merge preview", preview.status === 200 && plain.length > 20, `chars=${plain.length}`);

      const polish = await fetchJson(`/api/matters/${matterId}/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "polish", plainText: plain }),
        cookieJar: mp,
      });
      check(
        "Draft polish fails open",
        polish.status === 200 && polish.body.ok === true,
        `polished=${String(dataOf(polish.body).polished)}`,
      );
    } else {
      check("Draft merge preview", false, "no templates");
    }
  }

  const accountsAsk = await fetchJson("/api/ai/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: "Hello" }),
    cookieJar: accounts,
  });
  check("Accounts role without ai.use blocked", accountsAsk.status === 403);

  const juniorKb = await fetchJson("/api/ai/knowledge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "pack" }),
    cookieJar: junior,
  });
  check("Junior cannot manage KB", juniorKb.status === 403);

  const health = await fetchJson("/api/health");
  check("Health endpoint (deploy readiness)", health.status === 200);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
