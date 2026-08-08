import { jsonError, jsonOk } from "@/lib/auth/http";
import { STARTER_PACK_VERSION } from "@/lib/ai/kb/starter-pack";
import { getAppVersionInfo } from "@/lib/release/version";
import { getLicenceUsage } from "@/lib/licensing/policy";
import {
  getEffectiveLicence,
  serializeEffectiveLicence,
} from "@/lib/repos/licences";
import { getKnowledgePackStats } from "@/lib/repos/knowledge";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

/**
 * About payload for Settings: app version, edition, licence, KB.
 * No secrets. SaaS has no "update available" prompt.
 */
export async function GET() {
  try {
    const session = await requirePermission("settings.manage");
    const firmId = tenantFirmId(session);
    const app = getAppVersionInfo();
    const [licence, usage, pack] = await Promise.all([
      getEffectiveLicence(firmId),
      getLicenceUsage(firmId),
      getKnowledgePackStats(),
    ]);

    return jsonOk({
      app: {
        name: app.name,
        version: app.version,
        channel: app.channel,
        releaseNotes: app.changelogPath,
        releasingDoc: app.releasingDocPath,
      },
      firm: {
        id: session.firm.id,
        name: session.firm.name,
        slug: session.firm.slug,
      },
      licence: serializeEffectiveLicence(licence),
      usage: {
        seats: usage.seats,
        seatsUsed: usage.seatsUsed,
        edition: usage.edition,
        aiProxyEligible: usage.aiProxyEligible,
      },
      knowledge: {
        packVersion: pack.packVersion ?? STARTER_PACK_VERSION,
        starterPackId: STARTER_PACK_VERSION,
        quality: pack.quality,
        systemChunkCount: pack.systemChunkCount,
        embeddingCount: pack.embeddingCount ?? 0,
        embeddingsReady: pack.embeddingsReady,
      },
      note: "Hosted SaaS: deploys apply on Railway. There is no separate desktop updater.",
    });
  } catch (err) {
    return jsonError(err);
  }
}
