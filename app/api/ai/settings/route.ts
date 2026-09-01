import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { DEFAULT_GEMINI_EMBEDDINGS_MODEL } from "@/lib/ai/test-provider";
import { CHAT_MODEL_CATALOG } from "@/lib/ai/model-catalog";
import { publicKeyInfo, setByoApiKey } from "@/lib/ai/secrets";
import { CLAUDE_CHAT_MODEL_ID, DEFAULT_MODELS, type LlmProviderId } from "@/lib/ai/types";
import {
  DEFAULT_MAX_OUTPUT_TOKENS,
  getAiSettings,
  normalizeKeyMode,
  normalizeRoutingMode,
  upsertAiSettings,
  type AiKeyMode,
  type AiRoutingMode,
} from "@/lib/repos/ai-settings";
import { assertCanUse } from "@/lib/licensing/policy";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

function serializeSettings(
  row: {
    firmId: string;
    providerDefault: string;
    modelDefault: string;
    embeddingsModel: string;
    webLookupEnabled: boolean;
    routingMode: string;
    monthlySoftBudget: number | null;
    maxOutputTokens: number;
    matterContextEnabled: boolean;
    keyMode: string;
    updatedAt: Date;
  } | null,
) {
  return {
    providerDefault: row?.providerDefault ?? "claude",
    modelDefault: row?.modelDefault ?? CLAUDE_CHAT_MODEL_ID,
    embeddingsModel: row?.embeddingsModel ?? DEFAULT_GEMINI_EMBEDDINGS_MODEL,
    webLookupEnabled: row?.webLookupEnabled ?? true,
    routingMode: row ? normalizeRoutingMode(row.routingMode) : "manual",
    monthlySoftBudget: row ? row.monthlySoftBudget : 500,
    maxOutputTokens: row?.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    matterContextEnabled: row?.matterContextEnabled ?? true,
    keyMode: normalizeKeyMode(row?.keyMode),
    disclaimerAlwaysOn: true,
    updatedAt: row?.updatedAt?.toISOString() ?? null,
  };
}

function parseProviderId(raw: unknown): LlmProviderId {
  const id = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (id === "claude" || id === "openai" || id === "gemini") return id;
  throw new AuthError("validation", "Provider must be gemini, claude, or openai.");
}

function parseRoutingMode(raw: unknown): AiRoutingMode {
  if (raw === undefined || raw === null || raw === "") return "auto";
  if (raw === "auto" || raw === "manual") return raw;
  throw new AuthError("validation", "routingMode must be auto or manual.");
}

function parseBudget(raw: unknown): number | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "" || raw === "unlimited") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    throw new AuthError(
      "validation",
      "monthlySoftBudget must be a non-negative integer, or null for unlimited.",
    );
  }
  return n === 0 ? null : n;
}

function parseKeyMode(raw: unknown): AiKeyMode {
  if (raw === undefined || raw === null || raw === "") return "direct";
  if (raw === "direct" || raw === "proxy") return raw;
  throw new AuthError("validation", "keyMode must be direct or proxy.");
}

function parseMaxTokens(raw: unknown): number | undefined {
  if (raw === undefined) return undefined;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 256 || n > 4096) {
    throw new AuthError("validation", "maxOutputTokens must be an integer from 256 to 4096.");
  }
  return n;
}

/** AI settings + key presence (never returns the key). */
export async function GET(request: Request) {
  try {
    const session = await requirePermission("ai.manage_settings");
    const firmId = tenantFirmId(session);
    const row = await getAiSettings(firmId);
    const key = await publicKeyInfo(firmId);

    return jsonOk({
      settings: serializeSettings(row),
      key,
      models: DEFAULT_MODELS,
      chatModelCatalog: CHAT_MODEL_CATALOG,
      connectionHint: key.status === "missing" ? "missing" : ("present" as const),
      help: {
        testing:
          "Managed keys: set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY on the server (.env.local locally, Railway Variables in production).",
        production:
          "Firm-wide: Managing Partner picks provider + model in Settings → AI. All staff use that choice (manual routing). Server env keys are shared; optional BYO keys override per firm.",
        byo: key.byoNote,
        embeddings:
          "Claude has no embeddings API: LexZim falls back to Gemini embeddings when a Gemini key is present. OpenAI embeddings use dimensions=768 to match the database.",
        routing:
          "Manual (recommended): every AI chat uses Default provider + Chat model below for the whole firm. Auto only falls back to another provider when the chosen key is missing.",
        safety:
          "Assistive only: verify important answers before relying on them.",
        keyMode:
          "Direct: firm BYO or server managed keys. LexZim Proxy: Firm-edition licence token; master keys stay on the proxy (never in the browser).",
      },
    });
  } catch (err) {
    return jsonError(err, request);
  }
}

/** Update AI prefs + optional BYO keys (never echoed back). */
export async function PATCH(request: Request) {
  try {
    const session = await requirePermission("ai.manage_settings");
    const firmId = tenantFirmId(session);
    const body = (await request.json()) as {
      providerDefault?: string;
      modelDefault?: string;
      embeddingsModel?: string;
      webLookupEnabled?: boolean;
      routingMode?: string;
      monthlySoftBudget?: number | null;
      maxOutputTokens?: number;
      matterContextEnabled?: boolean;
      keyMode?: string;
      byoKeys?: Partial<Record<LlmProviderId, string | null>>;
    };

    const providerDefault = parseProviderId(body.providerDefault ?? "claude");
    const defaults = DEFAULT_MODELS[providerDefault];
    const routingMode = parseRoutingMode(body.routingMode);
    const keyMode = parseKeyMode(body.keyMode);
    const monthlySoftBudget = parseBudget(body.monthlySoftBudget);
    const maxOutputTokens = parseMaxTokens(body.maxOutputTokens);

    if (keyMode === "proxy") {
      await assertCanUse(firmId, "ai_proxy");
    }

    if (body.byoKeys && typeof body.byoKeys === "object") {
      for (const id of ["gemini", "claude", "openai"] as LlmProviderId[]) {
        if (id in body.byoKeys) {
          const value = body.byoKeys[id];
          if (value === undefined) continue;
          await setByoApiKey(firmId, id, value);
        }
      }
    }

    const row = await upsertAiSettings(firmId, {
      providerDefault,
      modelDefault: body.modelDefault?.trim() || defaults.chat,
      embeddingsModel: body.embeddingsModel?.trim() || defaults.embeddings,
      webLookupEnabled: body.webLookupEnabled,
      routingMode,
      monthlySoftBudget,
      maxOutputTokens,
      matterContextEnabled: body.matterContextEnabled,
      keyMode,
    });

    await writeAuditLog({
      action: "ai.settings_update",
      firmId,
      userId: session.id,
      entityType: "ai_settings",
      entityId: firmId,
      metadata: {
        providerDefault: row.providerDefault,
        modelDefault: row.modelDefault,
        embeddingsModel: row.embeddingsModel,
        webLookupEnabled: row.webLookupEnabled,
        routingMode: row.routingMode,
        monthlySoftBudget: row.monthlySoftBudget,
        maxOutputTokens: row.maxOutputTokens,
        matterContextEnabled: row.matterContextEnabled,
        keyMode: row.keyMode,
        byoUpdated: body.byoKeys ? Object.keys(body.byoKeys) : [],
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({
      settings: serializeSettings(row),
      key: await publicKeyInfo(firmId),
    });
  } catch (err) {
    return jsonError(err, request);
  }
}
