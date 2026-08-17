import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { loadOnboardingDemoData } from "@/lib/onboarding/demo";
import { getOnboardingStatus } from "@/lib/onboarding/status";
import {
  deleteFirmSetting,
  ONBOARDING_DISMISSED_AT_KEY,
  ONBOARDING_EXPORT_ACK_KEY,
  upsertFirmSetting,
} from "@/lib/repos/firm-settings";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

/** Soft onboarding checklist (never blocks the app). */
export async function GET(request: Request) {
  try {
    const session = await requirePermission("settings.manage");
    const firmId = tenantFirmId(session);
    const status = await getOnboardingStatus(firmId);
    return jsonOk(status);
  } catch (err) {
    return jsonError(err, request);
  }
}

/**
 * Actions: dismiss | restore | acknowledge_export | load_demo
 * Body: { action: string }
 */
export async function POST(request: Request) {
  try {
    const session = await requirePermission("settings.manage");
    const firmId = tenantFirmId(session);
    const body = (await request.json()) as { action?: string };
    const action = (body.action ?? "").trim();
    const info = clientInfo(request);

    if (action === "dismiss") {
      await upsertFirmSetting(
        firmId,
        ONBOARDING_DISMISSED_AT_KEY,
        new Date().toISOString(),
      );
      await writeAuditLog({
        action: "onboarding.dismissed",
        firmId,
        userId: session.id,
        entityType: "firm",
        entityId: firmId,
        metadata: {},
        ipOrUserAgent: info,
      });
      return jsonOk(await getOnboardingStatus(firmId));
    }

    if (action === "restore") {
      await deleteFirmSetting(firmId, ONBOARDING_DISMISSED_AT_KEY);
      await writeAuditLog({
        action: "onboarding.restored",
        firmId,
        userId: session.id,
        entityType: "firm",
        entityId: firmId,
        metadata: {},
        ipOrUserAgent: info,
      });
      return jsonOk(await getOnboardingStatus(firmId));
    }

    if (action === "acknowledge_export") {
      await upsertFirmSetting(
        firmId,
        ONBOARDING_EXPORT_ACK_KEY,
        new Date().toISOString(),
      );
      await writeAuditLog({
        action: "onboarding.export_acknowledged",
        firmId,
        userId: session.id,
        entityType: "firm",
        entityId: firmId,
        metadata: {},
        ipOrUserAgent: info,
      });
      return jsonOk(await getOnboardingStatus(firmId));
    }

    if (action === "load_demo") {
      const result = await loadOnboardingDemoData(firmId, session.id);
      await writeAuditLog({
        action: "onboarding.demo_loaded",
        firmId,
        userId: session.id,
        entityType: "firm",
        entityId: firmId,
        metadata: result,
        ipOrUserAgent: info,
      });
      return jsonOk({
        ...(await getOnboardingStatus(firmId)),
        demo: result,
      });
    }

    throw new AuthError(
      "validation",
      "action must be dismiss, restore, acknowledge_export, or load_demo.",
    );
  } catch (err) {
    return jsonError(err, request);
  }
}
