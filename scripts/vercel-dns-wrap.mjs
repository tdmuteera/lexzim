/**
 * Run Vercel CLI with public DNS so api.vercel.com resolves on broken resolvers.
 * Usage: node scripts/vercel-dns-wrap.mjs <vercel args...>
 */
import dns from "node:dns";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

dns.setServers(["1.1.1.1", "8.8.8.8", "1.0.0.1"]);

const require = createRequire(import.meta.url);
let vercelBin;
try {
  vercelBin = require.resolve("vercel/dist/index.js");
} catch {
  vercelBin = null;
}

const args = process.argv.slice(2);
const cmd = vercelBin
  ? process.execPath
  : process.platform === "win32"
    ? "npx.cmd"
    : "npx";
const cmdArgs = vercelBin ? [vercelBin, ...args] : ["vercel", ...args];

const child = spawn(cmd, cmdArgs, {
  stdio: "inherit",
  env: process.env,
  shell: !vercelBin,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
