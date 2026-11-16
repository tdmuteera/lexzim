/**
 * Push selected .env.local / .env.railway keys to Vercel production env.
 * Usage: node --import ./scripts/dns-preload.mjs scripts/vercel-sync-env.mjs
 */
import dns from "node:dns";
import fs from "node:fs";
import path from "node:path";

dns.setServers(["1.1.1.1", "8.8.8.8", "1.0.0.1"]);

const root = process.cwd();
const token = (process.env.VERCEL_TOKEN || "").trim();
if (!token) {
  console.error("VERCEL_TOKEN required");
  process.exit(1);
}

const projectMeta = JSON.parse(
  fs.readFileSync(path.join(root, ".vercel", "project.json"), "utf8"),
);
const { projectId, orgId } = projectMeta;

const KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "DATABASE_URL",
  "DIRECT_URL",
  "AUTH_SECRET",
  "GEMINI_API_KEY",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_WORKSPACE_ID",
  "OPENAI_API_KEY",
  "PORTAL_ENABLED",
  "CRON_SECRET",
  "NEXT_PUBLIC_APP_URL",
];

function parseEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

const local = parseEnv(path.join(root, ".env.local"));
const railway = parseEnv(path.join(root, ".env.railway"));
const merged = { ...railway, ...local };

// Placeholder until first deploy URL is known; overwritten after deploy.
if (!merged.NEXT_PUBLIC_APP_URL || merged.NEXT_PUBLIC_APP_URL.includes("localhost")) {
  merged.NEXT_PUBLIC_APP_URL = "https://lexzim.vercel.app";
}

async function api(method, urlPath, body) {
  const res = await fetch(`https://api.vercel.com${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(`${method} ${urlPath} -> ${res.status}`);
    err.detail = json;
    throw err;
  }
  return json;
}

const existing = await api(
  "GET",
  `/v9/projects/${projectId}/env?teamId=${orgId}`,
);
const byKey = new Map(
  (existing.envs || []).map((e) => [`${e.key}:${(e.target || []).join(",")}`, e]),
);

let upserts = 0;
for (const key of KEYS) {
  const value = merged[key];
  if (value == null || value === "") {
    console.log(`skip ${key} (empty)`);
    continue;
  }
  const targets = ["production", "preview", "development"];
  const match = (existing.envs || []).find(
    (e) => e.key === key && (e.target || []).includes("production"),
  );
  try {
    if (match) {
      await api("PATCH", `/v9/projects/${projectId}/env/${match.id}?teamId=${orgId}`, {
        value,
        target: targets,
        type: key.includes("SECRET") || key.includes("PASSWORD") || key === "DATABASE_URL" || key === "DIRECT_URL" || key === "AUTH_SECRET" || key.endsWith("_KEY") && !key.startsWith("NEXT_PUBLIC_")
          ? "sensitive"
          : "plain",
      });
      console.log(`updated ${key}`);
    } else {
      await api("POST", `/v10/projects/${projectId}/env?teamId=${orgId}`, {
        key,
        value,
        target: targets,
        type:
          key.startsWith("NEXT_PUBLIC_") || key === "PORTAL_ENABLED"
            ? "plain"
            : "sensitive",
      });
      console.log(`created ${key}`);
    }
    upserts += 1;
  } catch (e) {
    console.error(`fail ${key}`, e.detail || e.message);
  }
}

console.log(`done upserts=${upserts}`);
