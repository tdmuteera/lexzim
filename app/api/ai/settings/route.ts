import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import {
  DEFAULT_GEMINI_CHAT_MODEL,
  DEFAULT_GEMINI_EMBEDDINGS_MODEL,
} from "@/lib/ai/test-provider";
import { publicKeyInfo } from "@/lib/ai/secrets";
import { getAiSettings, upsertAiSettings } from "@/lib/repos/ai-settings";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

function serializeSettings(row: {
  firmId: string;
  providerDefault: string;
  modelDefault: string;
  embeddingsModel: string;
  webLookupEnabled: boolean;
  updatedAt: Date;
} | null) {
  return {
    providerDefault: row?.providerDefault ?? "gemini",
    modelDefault: row?.modelDefault ?? DEFAULT_GEMINI_CHAT_MODEL,
    embeddingsModel: row?.embeddingsModel ?? DEFAULT_GEMINI_EMBEDDINGS_MODEL,
    webLookupEnabled: row?.webLookupEnabled ?? false,
    updatedAt: row?.updatedAt?.toISOString() ?? null,
  };
}

/** AI settings + key presence (never returns the key). */
export async function GET() {
  try {
    const session = await requirePermission("ai.manage_settings");
    const firmId = tenantFirmId(session);
    const row = await getAiSettings(firmId);
    const key = publicKeyInfo();

    return jsonOk({
      settings: serializeSettings(row),
      key,
      connectionHint:
        key.status === "missing"
          ? "missing"
          : ("present" as const),
      help: {
        testing:
          "Phase 2 testing may use a LexZim-managed GEMINI_API_KEY on the server (Railway / .env.local).",
        production:
          "Production may move to firm bring-your-own keys or a proxy in Phase 4.",
        byo: key.byoNote,
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}

/** Update non-secret AI prefs (provider/model flags). */
export async function PATCH(request: Request) {
  try {
    const session = await requirePermission("ai.manage_settings");
    const firmId = tenantFirmId(session);
    const body = (await request.json()) as {
      providerDefault?: string;
      modelDefault?: string;
      embeddingsModel?: string;
      webLookupEnabled?: boolean;
    };

    const providerDefault = (body.providerDefault ?? "gemini").trim().toLowerCase();
    if (providerDefault !== "gemini") {
      throw new AuthError(
        "validation",
        "Only Gemini is available in Phase 2. Claude/OpenAI arrive in Phase 4.",
      );
    }

    const row = await upsertAiSettings(firmId, {
      providerDefault: "gemini",
      modelDefault: body.modelDefault?.trim() || DEFAULT_GEMINI_CHAT_MODEL,
      embeddingsModel: body.embeddingsModel?.trim() || DEFAULT_GEMINI_EMBEDDINGS_MODEL,
      webLookupEnabled: body.webLookupEnabled,
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
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ settings: serializeSettings(row) });
  } catch (err) {
    return jsonError(err);
  }
}
