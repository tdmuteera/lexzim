/**
 * Pass Request into jsonError across app/api (P8-04).
 * Conservative: does not rewrite jsonOk argument lists.
 * Run: npx tsx scripts/wire-request-id-api-routes.ts
 */
import fs from "node:fs";
import path from "node:path";

const API_ROOT = path.join(process.cwd(), "app", "api");

function walk(dir: string, out: string[] = []): string[] {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, out);
    else if (ent.name === "route.ts") out.push(full);
  }
  return out;
}

function processFile(src: string): string {
  let out = src;

  out = out.replace(
    /export async function (GET|POST|PUT|PATCH|DELETE)\(\s*\)/g,
    "export async function $1(request: Request)",
  );

  out = out.replace(/jsonError\(\s*err\s*\)/g, "jsonError(err, request)");

  if (
    /export async function (GET|POST|PUT|PATCH|DELETE)\(\s*req\s*:/.test(out) &&
    out.includes("jsonError(err, request)")
  ) {
    out = out.replace(/jsonError\(err, request\)/g, "jsonError(err, req)");
  }

  return out;
}

let changed = 0;
for (const file of walk(API_ROOT)) {
  const before = fs.readFileSync(file, "utf8");
  if (!before.includes("jsonError")) continue;
  const next = processFile(before);
  if (next !== before) {
    fs.writeFileSync(file, next, "utf8");
    changed += 1;
    console.log("updated", path.relative(process.cwd(), file).replace(/\\/g, "/"));
  }
}
console.log(`Done. Updated ${changed} route files.`);
