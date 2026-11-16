/**
 * Pre-release security gate for LexZim tenancy / Data API lockdown.
 *
 * Default (safe, no DB writes):
 *   npm run security:release-gate
 *     → check-firm-id-scope + verify-data-api-lockdown
 *
 * With migrations (needs DIRECT_URL; mutates DB):
 *   RELEASE_MIGRATE=1 npm run security:release-gate
 *     → drizzle-kit migrate, then the checks above
 *
 * After a schema release against staging/prod, also run:
 *   npm run smoke:tenant-isolation
 * against a seeded environment (pilot + isolation@lexzim.local).
 */
import { spawnSync } from "node:child_process";
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env.local") });

function run(label: string, command: string, args: string[]): boolean {
  console.log(`\n==> ${label}`);
  console.log(`$ ${command} ${args.join(" ")}`);
  const res = spawnSync([command, ...args].join(" "), {
    stdio: "inherit",
    shell: true,
    env: process.env,
  });
  if (res.status !== 0) {
    console.error(`FAIL  ${label} (exit ${res.status ?? "null"})`);
    return false;
  }
  console.log(`PASS  ${label}`);
  return true;
}

function main() {
  const migrate = process.env.RELEASE_MIGRATE === "1";
  let ok = true;

  console.log("LexZim security release gate");
  console.log(
    migrate
      ? "Mode: migrate + static firm_id check + Data API lockdown verify"
      : "Mode: static firm_id check + Data API lockdown verify (set RELEASE_MIGRATE=1 to migrate)",
  );

  if (migrate) {
    const direct = process.env.DIRECT_URL || process.env.DATABASE_URL;
    if (!direct) {
      console.error("RELEASE_MIGRATE=1 requires DIRECT_URL or DATABASE_URL.");
      process.exit(1);
    }
    ok =
      run("drizzle-kit migrate", "npx", ["drizzle-kit", "migrate"]) && ok;
  }

  ok =
    run("firm_id static scope check", "npx", [
      "tsx",
      "scripts/check-firm-id-scope.ts",
    ]) && ok;

  ok =
    run("Data API lockdown verify", "npx", [
      "tsx",
      "scripts/verify-data-api-lockdown.ts",
    ]) && ok;

  console.log(
    "\nReminder: run `npm run smoke:tenant-isolation` against a live app with pilot + isolation users before promoting a commercial release.",
  );

  if (!ok) {
    console.error("\nsecurity:release-gate FAILED.");
    process.exit(1);
  }
  console.log("\nsecurity:release-gate OK.");
}

main();
