/**
 * Phase 8 closeout smoke (P8-14).
 * Usage: npm run smoke:phase8
 * Requires: running app (SMOKE_BASE_URL). No platform admin cookie needed for HTTP checks.
 *
 * Also asserts registry + workflow contracts via direct imports (no rebuild of Finance/HR/GL).
 */
import { config } from "dotenv";
import { getModuleRegistry } from "../lib/diagnostics/registry";
import {
  WORKFLOW_CONTRACTS,
  assertTrustReceiptNotFeePayment,
} from "../lib/diagnostics/workflows";

config({ path: ".env.local" });

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";

type Json = Record<string, unknown>;

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function fetchJson(
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: Json; text: string; headers: Headers }> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: Json = {};
  try {
    body = JSON.parse(text) as Json;
  } catch {
    body = { raw: text };
  }
  return { status: res.status, body, text, headers: res.headers };
}

function requestIdFrom(body: Json, headers: Headers): string | null {
  const err = body.error;
  const fromError =
    err && typeof err === "object" && err !== null && "requestId" in err
      ? (err as { requestId?: unknown }).requestId
      : null;
  const fromBody =
    typeof body.requestId === "string"
      ? body.requestId
      : typeof fromError === "string"
        ? fromError
        : null;
  const fromHeader =
    headers.get("x-request-id") ?? headers.get("X-Request-Id") ?? null;
  return fromBody || fromHeader;
}

async function main() {
  console.log(`Phase 8 smoke against ${BASE}`);

  // 1) GET /api/health → 200 or 503 JSON with ok boolean
  {
    const res = await fetchJson("/api/health");
    assert(
      res.status === 200 || res.status === 503,
      `health status ${res.status}`,
    );
    assert(typeof res.body.ok === "boolean", "health.ok must be boolean");
    console.log("ok  /api/health", res.status, `ok=${res.body.ok}`);
  }

  // 2) GET /api/db-status must not leak postgres://
  {
    const res = await fetchJson("/api/db-status");
    assert(
      !res.text.toLowerCase().includes("postgres://"),
      "db-status must not contain postgres://",
    );
    assert(
      !res.text.toLowerCase().includes("postgresql://"),
      "db-status must not contain postgresql://",
    );
    console.log("ok  /api/db-status (no connection string leak)", res.status);
  }

  // 3) jsonError shape includes requestId (failed login)
  {
    const res = await fetchJson("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "smoke-phase8-missing@lexzim.invalid",
        password: "definitely-wrong-password",
      }),
    });
    assert(
      res.status === 401 || res.status === 400,
      `login failure status ${res.status}`,
    );
    const rid = requestIdFrom(res.body, res.headers);
    assert(rid && rid.length > 8, "login error must include requestId");
    assert(res.body.ok === false, "login error ok=false");
    console.log("ok  login error envelope has requestId");
  }

  // 4) Ops diagnostics APIs without platform admin → 401/403
  {
    const paths = [
      "/api/ops/diagnostics/health",
      "/api/ops/diagnostics/registry",
      "/api/ops/diagnostics/workflows",
      "/api/ops/diagnostics/repair/runtime",
      "/api/ops/diagnostics/repair/propose",
    ];
    for (const path of paths) {
      const res = await fetchJson(path);
      assert(
        res.status === 401 || res.status === 403,
        `${path} expected 401/403 got ${res.status}`,
      );
    }
    console.log("ok  ops diagnostics APIs reject unauthenticated callers");
  }

  // 5) Registry includes /matters and /finance/trust
  {
    const registry = getModuleRegistry();
    const hrefs = registry.modules.flatMap((m) => m.nav.map((n) => n.href));
    assert(
      hrefs.some((h) => h === "/matters" || h.startsWith("/matters")),
      "registry must include /matters nav",
    );
    assert(
      hrefs.some((h) => h === "/finance/trust" || h.startsWith("/finance/trust")),
      "registry must include /finance/trust nav",
    );
    console.log("ok  registry includes /matters and /finance/trust");
  }

  // 6) Workflows: trust receipt ≠ fee payment
  {
    const ids = WORKFLOW_CONTRACTS.map((w) => w.id);
    assert(ids.includes("finance.trust.receipt"), "missing finance.trust.receipt");
    assert(ids.includes("finance.payment.post"), "missing finance.payment.post");
    assert(
      ids.filter((id) => id === "finance.trust.receipt").length === 1,
      "trust receipt must be a distinct workflow id",
    );
    assertTrustReceiptNotFeePayment();
    console.log(
      "ok  workflows keep finance.trust.receipt distinct from finance.payment.post",
    );
  }

  console.log("\nPhase 8 smoke passed.");
  console.log(
    "Regression notes (manual): dashboard chart labels visible; finance invoicing scrolls in .panel-body.",
  );
}

main().catch((err) => {
  console.error("\nPhase 8 smoke FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
