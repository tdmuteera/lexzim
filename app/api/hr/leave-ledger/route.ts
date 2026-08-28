import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import {
  listLeaveLedger,
  upsertLeaveEntitlement,
} from "@/lib/repos/hr-leave-ledger";
import { getStaffProfile } from "@/lib/repos/hr";
import { hasPermission, requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

/**
 * GET /api/hr/leave-ledger?staffProfileId=&year=
 * PUT /api/hr/leave-ledger  { staffProfileId, leaveTypeId, year, entitlementDays }
 */
export async function GET(request: Request) {
  try {
    const session = await requirePermission("hr.view");
    const firmId = tenantFirmId(session);
    const url = new URL(request.url);
    const staffProfileId = url.searchParams.get("staffProfileId")?.trim();
    if (!staffProfileId) {
      throw new AuthError("validation", "staffProfileId is required.");
    }
    const yearRaw = url.searchParams.get("year");
    const year = yearRaw ? Number(yearRaw) : new Date().getUTCFullYear();
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new AuthError("validation", "year is invalid.");
    }

    const staff = await getStaffProfile(firmId, staffProfileId);
    if (!staff) {
      throw new AuthError("not_found", "Staff profile not found.");
    }

    const items = await listLeaveLedger(firmId, staffProfileId, year);
    return jsonOk({
      staffProfileId,
      staffName: staff.profile.fullName,
      year,
      items,
    });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function PUT(request: Request) {
  try {
    const session = await requirePermission("hr.manage");
    const firmId = tenantFirmId(session);
    const body = (await request.json()) as Record<string, unknown>;

    const staffProfileId =
      typeof body.staffProfileId === "string" ? body.staffProfileId.trim() : "";
    const leaveTypeId =
      typeof body.leaveTypeId === "string" ? body.leaveTypeId.trim() : "";
    const year = Number(body.year);
    const entitlementDays = Number(body.entitlementDays);

    if (!staffProfileId || !leaveTypeId) {
      throw new AuthError("validation", "staffProfileId and leaveTypeId are required.");
    }
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new AuthError("validation", "year is invalid.");
    }
    if (
      !Number.isInteger(entitlementDays) ||
      entitlementDays < 0 ||
      entitlementDays > 365
    ) {
      throw new AuthError("validation", "entitlementDays must be 0–365.");
    }

    const staff = await getStaffProfile(firmId, staffProfileId);
    if (!staff) {
      throw new AuthError("not_found", "Staff profile not found.");
    }

    const row = await upsertLeaveEntitlement({
      firmId,
      staffProfileId,
      leaveTypeId,
      year,
      entitlementDays,
    });

    await writeAuditLog({
      action: "hr_leave_ledger.upsert",
      firmId,
      userId: session.id,
      entityType: "hr_leave_entitlement",
      entityId: row.id,
      metadata: { staffProfileId, leaveTypeId, year, entitlementDays },
      ipOrUserAgent: clientInfo(request),
    });

    const items = await listLeaveLedger(firmId, staffProfileId, year);
    return jsonOk({
      staffProfileId,
      year,
      items,
      canManage: hasPermission(session, "hr.manage"),
    });
  } catch (err) {
    return jsonError(err, request);
  }
}
