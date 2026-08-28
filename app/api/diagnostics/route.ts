import { jsonError } from "@/lib/auth/http";
import { STARTER_PACK_VERSION } from "@/lib/ai/kb/starter-pack";
import { getAiSettings } from "@/lib/repos/ai-settings";
import { publicKeyInfo } from "@/lib/ai/secrets";
import { getAppPublicUrl } from "@/lib/env";
import { getLicenceUsage } from "@/lib/licensing/policy";
import { getAppVersionInfo } from "@/lib/release/version";
import {
  getEffectiveLicence,
  serializeEffectiveLicence,
} from "@/lib/repos/licences";
import { getKnowledgePackStats } from "@/lib/repos/knowledge";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

/**
 * Safe support diagnostics (P4-13).
 * Version, firm id, edition, env booleans. No matter contents. No secrets. No auto-upload.
 */
export async function GET(request: Request) {
  try {
    const session = await requirePermission("settings.manage");
    const firmId = tenantFirmId(session);
    const app = getAppVersionInfo();
    const appUrl = getAppPublicUrl();

    const [licence, usage, pack, aiRow, keys] = await Promise.all([
      getEffectiveLicence(firmId),
      getLicenceUsage(firmId),
      getKnowledgePackStats(),
      getAiSettings(firmId),
      publicKeyInfo(firmId),
    ]);

    const payload = {
      generatedAt: new Date().toISOString(),
      purpose: "LexZim support diagnostics",
      containsMatterData: false,
      autoUpload: false,
      app: {
        name: app.name,
        version: app.version,
        channel: app.channel,
      },
      host: {
        railwayEnvironment: process.env.RAILWAY_ENVIRONMENT_NAME?.trim() || null,
        nodeEnv: process.env.NODE_ENV ?? null,
        appUrlConfigured: Boolean(appUrl),
        appUrlHttps: appUrl.startsWith("https://"),
      },
      firm: {
        id: firmId,
        name: session.firm.name,
        slug: session.firm.slug,
        status: session.firm.status,
        isDemo: session.firm.isDemo,
      },
      licence: {
        edition: licence.edition,
        status: licence.status,
        isActive: licence.isActive,
        seats: licence.seats,
        seatsUsed: usage.seatsUsed,
        maxMatters: licence.maxMatters,
        expiresAt: licence.expiresAt ? licence.expiresAt.toISOString() : null,
        exportAllowed: licence.exportAllowed,
        blocksNewMatters: licence.blocksNewMatters,
        features: serializeEffectiveLicence(licence).features,
      },
      ai: {
        settingsPresent: Boolean(aiRow),
        providerDefault: aiRow?.providerDefault ?? null,
        routingMode: aiRow?.routingMode ?? null,
        keyMode: aiRow?.keyMode ?? null,
        webLookupEnabled: aiRow?.webLookupEnabled ?? true,
        matterContextEnabled: aiRow?.matterContextEnabled ?? true,
        monthlySoftBudget: aiRow ? aiRow.monthlySoftBudget : null,
        keyStatus: keys.status,
        keysByProvider: Object.fromEntries(
          Object.entries(keys.providers).map(([id, info]) => [
            id,
            { status: info.status, source: info.source },
          ]),
        ),
      },
      knowledge: {
        packVersion: pack.packVersion ?? STARTER_PACK_VERSION,
        systemChunkCount: pack.systemChunkCount,
        embeddingCount: pack.embeddingCount ?? 0,
        embeddingsReady: pack.embeddingsReady,
        quality: pack.quality,
      },
      requestedBy: {
        userId: session.id,
        email: session.email,
        role: session.role.code,
      },
      note: "Attach this file to a support ticket. It does not include clients, matters, documents, or API keys.",
    };

    const body = `${JSON.stringify(payload, null, 2)}\n`;
    const filename = `lexzim-diagnostics-${session.firm.slug}-${app.version}.json`;

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return jsonError(err, request);
  }
}
