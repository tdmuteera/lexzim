import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { requireSession } from "@/lib/auth/session";
import { hasPermission, requirePermission } from "@/lib/rbac/guards";
import {
  getFirmNavPinnedSections,
  setFirmNavPinnedSections,
} from "@/lib/repos/firm-settings";
import { tenantFirmId } from "@/lib/tenant/scope";

/** GET: firm-wide pinned sidebar sections (any signed-in user). */
export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const firmId = tenantFirmId(session);
    const pinned = await getFirmNavPinnedSections(firmId);
    return jsonOk({
      pinnedSections: pinned,
      canEdit: hasPermission(session, "settings.manage"),
    });
  } catch (err) {
    return jsonError(err, request);
  }
}

/**
 * PUT: set firm-wide pinned sidebar sections (settings.manage).
 * Body: { pinnedSections: string[] } or { section: string, pinned: boolean }
 */
export async function PUT(request: Request) {
  try {
    const session = await requirePermission("settings.manage");
    const firmId = tenantFirmId(session);
    const body = (await request.json()) as Record<string, unknown>;

    let next: string[];
    if (Array.isArray(body.pinnedSections)) {
      next = body.pinnedSections
        .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
        .map((s) => s.trim());
    } else if (typeof body.section === "string" && body.section.trim()) {
      const section = body.section.trim();
      const current = await getFirmNavPinnedSections(firmId);
      const wantPinned = Boolean(body.pinned);
      if (wantPinned) {
        next = current.includes(section) ? current : [...current, section];
      } else {
        next = current.filter((s) => s !== section);
      }
    } else {
      throw new AuthError(
        "validation",
        "Provide pinnedSections or section + pinned.",
      );
    }

    // Dedupe, preserve order
    const seen = new Set<string>();
    next = next.filter((s) => {
      if (seen.has(s)) return false;
      seen.add(s);
      return true;
    });

    await setFirmNavPinnedSections(firmId, next);

    await writeAuditLog({
      action: "settings.nav_pins_update",
      firmId,
      userId: session.id,
      entityType: "firm_settings",
      entityId: firmId,
      metadata: { pinnedSections: next },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ pinnedSections: next, canEdit: true });
  } catch (err) {
    return jsonError(err, request);
  }
}
