/**
 * Apply rotated secrets into .env.local from a gitignored input file.
 *
 * 1. Copy .env.rotation-template to .env.rotation-input and fill values.
 * 2. npx tsx scripts/apply-secret-rotation.ts
 *
 * Never prints secret values.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const LOCAL = resolve(ROOT, ".env.local");
const INPUT = resolve(ROOT, ".env.rotation-input");

function parseEnv(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith("#") || !s.includes("=")) continue;
    const i = s.indexOf("=");
    map.set(s.slice(0, i).trim(), s.slice(i + 1));
  }
  return map;
}

function upsert(text: string, key: string, value: string): string {
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(text)) return text.replace(re, `${key}=${value}`);
  return `${text.replace(/\s*$/, "")}\n${key}=${value}\n`;
}

function encodeDbPassword(pw: string): string {
  return encodeURIComponent(pw);
}

function withPassword(url: string, password: string): string {
  // postgresql://user:PASS@host:port/db
  return url.replace(/:([^:@/]+)@/, `:${encodeDbPassword(password)}@`);
}

async function main() {
  if (!existsSync(INPUT)) {
    console.error("Missing .env.rotation-input. Fill the template first.");
    process.exit(1);
  }
  if (!existsSync(LOCAL)) {
    console.error("Missing .env.local");
    process.exit(1);
  }

  const incoming = parseEnv(readFileSync(INPUT, "utf8"));
  let local = readFileSync(LOCAL, "utf8");
  const applied: string[] = [];

  const set = (key: string) => {
    const v = incoming.get(key)?.trim();
    if (!v || v.startsWith("PASTE_") || v === "GENERATE_ME") return;
    local = upsert(local, key, v);
    applied.push(key);
  };

  for (const key of [
    "AUTH_SECRET",
    "DEVELOPER_UNLOCK_PASSWORD",
    "SUPABASE_SERVICE_ROLE_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "GEMINI_API_KEY",
    "TAVILY_API_KEY",
    "SMTP_PASSWORD",
    "AI_VAULT_SECRET",
    "PORTAL_SESSION_SECRET",
    "AI_PROXY_TOKEN_PEPPER",
  ]) {
    set(key);
  }

  const dbPw = incoming.get("DATABASE_PASSWORD")?.trim();
  if (dbPw && !dbPw.startsWith("PASTE_")) {
    const dbUrl = (parseEnv(local).get("DATABASE_URL") || "").trim();
    const direct = (parseEnv(local).get("DIRECT_URL") || "").trim();
    if (dbUrl) {
      local = upsert(local, "DATABASE_URL", withPassword(dbUrl, dbPw));
      applied.push("DATABASE_URL");
    }
    if (direct) {
      local = upsert(local, "DIRECT_URL", withPassword(direct, dbPw));
      applied.push("DIRECT_URL");
    }
  }

  writeFileSync(LOCAL, local, { encoding: "utf8" });
  console.log(JSON.stringify({ ok: true, updatedKeys: applied }));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
