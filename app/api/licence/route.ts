import { jsonError, jsonOk } from "@/lib/auth/http";
import { getLicenceUsage } from "@/lib/licensing/policy";
import {
  getEffectiveLicence,
  serializeEffectiveLicence,
} from "@/lib/repos/licences";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

/** Firm-facing licence summary (Settings → Licence). */
export async function GET() {
  try {
    const session = await requirePermission("settings.manage");
    const firmId = tenantFirmId(session);
    const [licence, usage] = await Promise.all([
      getEffectiveLicence(firmId),
      getLicenceUsage(firmId),
    ]);
    return jsonOk({
      licence: serializeEffectiveLicence(licence),
      usage,
      policy: {
        onExpiry:
          "Block new matters and intake conversion. Export always remains available.",
        editions: ["trial", "solo", "firm"],
        trialMatterCap: 25,
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
