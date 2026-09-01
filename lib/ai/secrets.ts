import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { getFirmSetting, upsertFirmSetting } from "@/lib/repos/firm-settings";
import type { LlmProviderId } from "@/lib/ai/types";

/**
 * AI secrets (P4-02 / P4-06). Never return raw keys to the browser.
 * Managed: GEMINI_API_KEY / ANTHROPIC_API_KEY / OPENAI_API_KEY on server env.
 * BYO: encrypted firm_settings values (sensitive; stripped from export).
 * Proxy client token: encrypted copy for app→proxy calls (LexZim Proxy mode).
 */

const BYO_SETTING_KEYS: Record<LlmProviderId, string> = {
  gemini: "ai_byo_gemini_key",
  claude: "ai_byo_claude_key",
  openai: "ai_byo_openai_key",
};

const PROXY_CLIENT_TOKEN_KEY = "ai_proxy_client_token";

const ENV_KEYS: Record<LlmProviderId, string> = {
  gemini: "GEMINI_API_KEY",
  claude: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
};

/** Required for multi-workspace identity-linked Anthropic keys (wrkspc_…). */
export const ANTHROPIC_WORKSPACE_ENV = "ANTHROPIC_WORKSPACE_ID";

function vaultSecret(): Buffer {
  const raw =
    process.env.AI_VAULT_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    "lexzim-dev-ai-vault-insecure";
  return createHash("sha256").update(raw).digest();
}

/** Encrypt BYO key for firm_settings storage. Prefix v1: */
export function encryptByoKey(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", vaultSecret(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${enc.toString("base64url")}`;
}

export function decryptByoKey(stored: string): string | null {
  try {
    if (!stored.startsWith("v1:")) return null;
    const [, ivB64, tagB64, dataB64] = stored.split(":");
    if (!ivB64 || !tagB64 || !dataB64) return null;
    const decipher = createDecipheriv(
      "aes-256-gcm",
      vaultSecret(),
      Buffer.from(ivB64, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64url")),
      decipher.final(),
    ]);
    return plain.toString("utf8");
  } catch {
    return null;
  }
}

export function getManagedApiKey(provider: LlmProviderId): string | null {
  const key = process.env[ENV_KEYS[provider]]?.trim();
  return key ? key : null;
}

export function getAnthropicWorkspaceId(): string | null {
  const id = process.env[ANTHROPIC_WORKSPACE_ENV]?.trim();
  return id ? id : null;
}

export async function getByoApiKey(
  firmId: string,
  provider: LlmProviderId,
): Promise<string | null> {
  const stored = await getFirmSetting(firmId, BYO_SETTING_KEYS[provider]);
  if (!stored?.trim()) return null;
  return decryptByoKey(stored);
}

export async function setByoApiKey(
  firmId: string,
  provider: LlmProviderId,
  plainKey: string | null,
): Promise<void> {
  const settingKey = BYO_SETTING_KEYS[provider];
  if (!plainKey?.trim()) {
    await upsertFirmSetting(firmId, settingKey, "");
    return;
  }
  await upsertFirmSetting(firmId, settingKey, encryptByoKey(plainKey.trim()));
}

/** Encrypted firm proxy token used by the app when key_mode=proxy. */
export async function setProxyClientToken(
  firmId: string,
  plainToken: string | null,
): Promise<void> {
  if (!plainToken?.trim()) {
    await upsertFirmSetting(firmId, PROXY_CLIENT_TOKEN_KEY, "");
    return;
  }
  await upsertFirmSetting(firmId, PROXY_CLIENT_TOKEN_KEY, encryptByoKey(plainToken.trim()));
}

export async function getProxyClientToken(firmId: string): Promise<string | null> {
  const stored = await getFirmSetting(firmId, PROXY_CLIENT_TOKEN_KEY);
  if (!stored?.trim()) return null;
  return decryptByoKey(stored);
}

/** BYO wins over managed env for that firm. */
export async function resolveProviderApiKey(
  firmId: string,
  provider: LlmProviderId,
): Promise<{ key: string | null; source: "byo" | "server_env" | "missing" }> {
  const byo = await getByoApiKey(firmId, provider);
  if (byo) return { key: byo, source: "byo" };
  const managed = getManagedApiKey(provider);
  if (managed) return { key: managed, source: "server_env" };
  return { key: null, source: "missing" };
}

export function getGeminiApiKey(): string | null {
  return getManagedApiKey("gemini");
}

export function getGeminiKeyStatus(): "missing" | "present" {
  return getGeminiApiKey() ? "present" : "missing";
}

export function requireGeminiApiKey(): string {
  const key = getGeminiApiKey();
  if (!key) {
    throw new Error("GEMINI_API_KEY is not configured on the server.");
  }
  return key;
}

/** Safe for API responses — never includes the key. */
export async function publicKeyInfo(firmId: string) {
  const providers: LlmProviderId[] = ["gemini", "claude", "openai"];
  const perProvider: Record<
    LlmProviderId,
    { status: "missing" | "present"; source: "byo" | "server_env" | "missing" }
  > = {
    gemini: { status: "missing", source: "missing" },
    claude: { status: "missing", source: "missing" },
    openai: { status: "missing", source: "missing" },
  };

  for (const id of providers) {
    const resolved = await resolveProviderApiKey(firmId, id);
    perProvider[id] = {
      status: resolved.key ? "present" : "missing",
      source: resolved.source,
    };
  }

  const anyPresent = providers.some((id) => perProvider[id].status === "present");

  return {
    source: "mixed" as const,
    status: anyPresent ? ("present" as const) : ("missing" as const),
    byoAvailable: true,
    byoNote:
      "Optional BYO keys are stored encrypted per firm. Leave blank to use server env (managed) keys.",
    providers: perProvider,
    envNames: ENV_KEYS,
  };
}

export { BYO_SETTING_KEYS, ENV_KEYS, PROXY_CLIENT_TOKEN_KEY };
