/**
 * Probe Anthropic credentials from .env.local (no secrets printed).
 * Usage: npx tsx scripts/probe-anthropic-env.ts
 */
import { config } from "dotenv";

config({ path: ".env.local" });

const key = process.env.ANTHROPIC_API_KEY?.trim();
const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID?.trim();

async function main() {
  if (!key) {
    console.log("ANTHROPIC_API_KEY: missing");
    process.exit(1);
  }
  console.log(
    `ANTHROPIC_API_KEY: present (starts with ${key.slice(0, 12)}…, length ${key.length})`,
  );
  console.log(
    workspaceId
      ? `ANTHROPIC_WORKSPACE_ID: ${workspaceId.slice(0, 12)}… (length ${workspaceId.length})`
      : "ANTHROPIC_WORKSPACE_ID: not set",
  );

  if (!key.startsWith("sk-ant-")) {
    console.log("WARN: API key does not look like sk-ant-… — you may have pasted workspace name into ANTHROPIC_API_KEY.");
  }
  if (workspaceId && !workspaceId.startsWith("wrkspc_")) {
    console.log("WARN: workspace id should start with wrkspc_ — not the workspace display name.");
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      ...(workspaceId ? { "anthropic-workspace-id": workspaceId } : {}),
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 16,
      messages: [{ role: "user", content: "Say OK" }],
    }),
  });
  const text = await res.text();
  console.log(`HTTP ${res.status}`);
  try {
    const json = JSON.parse(text) as { error?: { type?: string; message?: string } };
    console.log(json.error?.type ?? "ok", json.error?.message?.slice(0, 200) ?? text.slice(0, 120));
  } catch {
    console.log(text.slice(0, 200));
  }
}

main().catch(console.error);
