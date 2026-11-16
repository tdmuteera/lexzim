/**
 * Static guard: firm-scoped tables and API/repos should keep firm_id in scope.
 *
 * Does not replace runtime IDOR smokes. Catches common regressions:
 * 1) lib/repos query a firm-scoped table without firmId in the enclosing function
 * 2) firm-data API routes import repos but never establish tenant / portal / platform scope
 *
 * Usage: npm run security:check-firm-scope
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function walk(dir: string, pred: (f: string) => boolean): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      out.push(...walk(full, pred));
    } else if (pred(full)) {
      out.push(full);
    }
  }
  return out;
}

/** Tables in schema.ts that declare firmId. */
function firmScopedTables(): string[] {
  const schemaPath = path.join(ROOT, "lib", "db", "schema.ts");
  const src = fs.readFileSync(schemaPath, "utf8");
  const tables: string[] = [];
  const tableRe =
    /export const ([A-Za-z0-9_]+)\s*=\s*pgTable\(\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = tableRe.exec(src))) {
    const exportName = m[1];
    const start = m.index;
    const window = src.slice(start, start + 2500);
    if (/\bfirmId\s*:/.test(window)) {
      tables.push(exportName);
    }
  }
  return tables.sort();
}

type Finding = { file: string; detail: string };

/** Approximate enclosing function body for an index in source. */
function enclosingFunction(src: string, index: number): string {
  const before = src.slice(0, index);
  const fnStarts = [
    ...before.matchAll(
      /(?:export\s+)?(?:async\s+)?function\s+[A-Za-z0-9_]+\s*\([^)]*\)\s*\{/g,
    ),
    ...before.matchAll(
      /(?:export\s+)?(?:const|let)\s+[A-Za-z0-9_]+\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{/g,
    ),
  ].map((m) => m.index ?? 0);
  const start = fnStarts.length ? fnStarts[fnStarts.length - 1]! : Math.max(0, index - 1200);
  // Prefer end of this function: next top-level-ish function after index, else +2500
  const after = src.slice(index);
  const nextFn = after.search(
    /\n(?:export\s+)?(?:async\s+)?function\s+[A-Za-z0-9_]+\s*\(|\n(?:export\s+)?(?:const|let)\s+[A-Za-z0-9_]+\s*=\s*(?:async\s*)?\(/,
  );
  const end = index + (nextFn > 0 ? nextFn : Math.min(after.length, 2500));
  return src.slice(start, end);
}

function hasFirmScopeSignal(text: string, table: string): boolean {
  return (
    /\bfirmId\b/.test(text) ||
    /\bfirm_id\b/.test(text) ||
    new RegExp(`\\b${table}\\.firmId\\b`).test(text) ||
    /\binput\.firmId\b/.test(text) ||
    /\bsession\.firm(?:Id|\.id)\b/.test(text) ||
    /\btenantFirmId\s*\(/.test(text)
  );
}

function checkRepos(tables: string[]): Finding[] {
  const findings: Finding[] = [];
  const repoFiles = walk(path.join(ROOT, "lib", "repos"), (f) => f.endsWith(".ts"));
  const tableSet = new Set(tables);

  for (const file of repoFiles) {
    const src = fs.readFileSync(file, "utf8");
    const rel = path.relative(ROOT, file).replace(/\\/g, "/");

    for (const table of tableSet) {
      const opRe = new RegExp(
        `\\.(?:from|update|delete|insert)\\(\\s*${table}\\s*\\)`,
        "g",
      );
      let op: RegExpExecArray | null;
      while ((op = opRe.exec(src))) {
        const fn = enclosingFunction(src, op.index);
        if (!hasFirmScopeSignal(fn, table)) {
          const line = src.slice(0, op.index).split(/\r?\n/).length;
          findings.push({
            file: rel,
            detail: `L${line}: .from/.update/.delete/.insert(${table}) without firmId in enclosing function`,
          });
        }
      }
    }
  }
  return findings;
}

/** API routes that touch firm data via repos must establish tenant / portal / platform scope. */
function checkApiRoutes(): Finding[] {
  const findings: Finding[] = [];
  const routes = walk(path.join(ROOT, "app", "api"), (f) =>
    f.replace(/\\/g, "/").endsWith("/route.ts"),
  );

  const allowNoTenant = [
    "/app/api/health/",
    "/app/api/about/",
    "/app/api/db-status/",
    "/app/api/auth/",
    "/app/api/portal/auth/",
    "/app/api/portal/health/",
    "/app/api/cron/",
    "/app/api/onboarding/",
    "/app/api/licence/",
    "/app/api/security/",
  ];

  for (const file of routes) {
    const rel = path.relative(ROOT, file).replace(/\\/g, "/");
    const norm = `/${rel}`;
    if (allowNoTenant.some((p) => norm.includes(p))) continue;

    const src = fs.readFileSync(file, "utf8");
    const usesRepos = /from\s+["']@\/lib\/repos\//.test(src);
    if (!usesRepos) continue;

    const hasTenant =
      /\btenantFirmId\s*\(/.test(src) ||
      /\brequireFirmScope\s*\(/.test(src) ||
      /\brequirePlatformAdmin\s*\(/.test(src) ||
      /\brequirePortalSession\s*\(/.test(src) ||
      /\bsession\.firm(?:Id|\.id)\b/.test(src) ||
      /from\s+["']@\/lib\/platform\//.test(src);

    if (!hasTenant) {
      findings.push({
        file: rel,
        detail:
          "imports lib/repos but never establishes tenantFirmId / portal session firm / platform admin / session.firm",
      });
    }
  }
  return findings;
}

function main() {
  const tables = firmScopedTables();
  if (tables.length < 10) {
    console.error(
      `Expected many firm-scoped tables in schema.ts; found ${tables.length}. Parser broken?`,
    );
    process.exit(1);
  }

  const findings = [...checkRepos(tables), ...checkApiRoutes()];

  console.log(
    JSON.stringify(
      {
        ok: findings.length === 0,
        firmScopedTableCount: tables.length,
        findingCount: findings.length,
        findings: findings.slice(0, 80),
        truncated: findings.length > 80,
      },
      null,
      2,
    ),
  );

  if (findings.length > 0) {
    console.error(
      `\nsecurity:check-firm-scope FAILED (${findings.length} finding(s)).`,
    );
    process.exit(1);
  }
  console.log("\nsecurity:check-firm-scope OK.");
}

main();
