/**
 * Verify developer unlock env is present (and optionally a candidate password).
 * Usage:
 *   npm run developer:unlock -- --check
 *   npm run developer:unlock -- --password "…"
 */
import { config } from "dotenv";
import {
  assertDeveloperUnlock,
  DEVELOPER_UNLOCK_ENV,
  verifyDeveloperUnlock,
} from "../lib/developer/unlock";

config({ path: ".env.local" });

function argValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return null;
  return process.argv[idx + 1] ?? null;
}

async function main() {
  const checkOnly = process.argv.includes("--check");
  const password = argValue("--password");

  if (!process.env[DEVELOPER_UNLOCK_ENV]) {
    console.error(`FAIL  ${DEVELOPER_UNLOCK_ENV} missing from .env.local`);
    process.exit(1);
  }

  if (checkOnly) {
    assertDeveloperUnlock();
    console.log(`ok  ${DEVELOPER_UNLOCK_ENV} is set (value not printed)`);
    return;
  }

  if (password) {
    if (!verifyDeveloperUnlock(password)) {
      console.error("FAIL  password mismatch");
      process.exit(1);
    }
    console.log("ok  password matches");
    return;
  }

  console.log(`Usage:
  npm run developer:unlock -- --check
  npm run developer:unlock -- --password "<candidate>"`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
