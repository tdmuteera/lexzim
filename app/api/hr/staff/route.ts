import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { parseStaffProfileInput } from "@/lib/hr/validation";
import { createDirectoryPerson } from "@/lib/repos/directory-people";
import {
  createStaffProfile,
  getStaffProfile,
  listLinkableUsers,
  listStaffProfiles,
} from "@/lib/repos/hr";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

function serializeStaff(row: Awaited<ReturnType<typeof listStaffProfiles>>[number]) {
  return {
    id: row.profile.id,
    fullName: row.profile.fullName,
    email: row.profile.email,
    phone: row.profile.phone,
    jobTitle: row.profile.jobTitle,
    department: row.profile.department,
    startDate: row.profile.startDate?.toISOString() ?? null,
    endDate: row.profile.endDate?.toISOString() ?? null,
    emergencyContactName: row.profile.emergencyContactName,
    emergencyContactPhone: row.profile.emergencyContactPhone,
    isActive: row.profile.isActive,
    annualLeaveEntitlementDays: row.profile.annualLeaveEntitlementDays,
    notes: row.profile.notes,
    userId: row.profile.userId,
    userEmail: row.userEmail,
    userFullName: row.userFullName,
    userIsActive: row.userIsActive,
    userIsLawyer: row.userIsLawyer,
    userIsSystemUser: row.userIsSystemUser,
    createdAt: row.profile.createdAt.toISOString(),
    updatedAt: row.profile.updatedAt.toISOString(),
  };
}

/**
 * GET /api/hr/staff?activeOnly=1
 * POST /api/hr/staff
 */
export async function GET(request: Request) {
  try {
    const session = await requirePermission("hr.view");
    const firmId = tenantFirmId(session);
    const url = new URL(request.url);
    const activeOnly = url.searchParams.get("activeOnly") === "1";

    const rows = await listStaffProfiles(firmId, { activeOnly });
    const linkableUsers = await listLinkableUsers(firmId);

    return jsonOk({
      items: rows.map(serializeStaff),
      linkableUsers: linkableUsers.map((u) => ({
        id: u.id,
        email: u.email,
        fullName: u.fullName,
        isActive: u.isActive,
        isLawyer: u.isLawyer,
        isSystemUser: u.isSystemUser,
        linkedProfileId: u.linkedProfileId,
      })),
    });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("hr.manage");
    const firmId = tenantFirmId(session);
    const body = await request.json();
    const input = parseStaffProfileInput(body);

    let userId = input.userId;
    if (!userId && input.listAsLawyer) {
      const person = await createDirectoryPerson(firmId, {
        fullName: input.fullName,
        email: input.email,
        jobTitle: input.jobTitle,
        isLawyer: true,
      });
      userId = person.id;
      await writeAuditLog({
        action: "users.create_directory",
        firmId,
        userId: session.id,
        entityType: "user",
        entityId: person.id,
        metadata: {
          email: person.email,
          fullName: person.fullName,
          source: "hr_staff",
          isLawyer: true,
        },
        ipOrUserAgent: clientInfo(request),
      });
    }

    const profile = await createStaffProfile(firmId, { ...input, userId });

    await writeAuditLog({
      action: "hr_staff.create",
      firmId,
      userId: session.id,
      entityType: "hr_staff_profile",
      entityId: profile.id,
      metadata: {
        fullName: profile.fullName,
        userId: profile.userId,
        isActive: profile.isActive,
        listAsLawyer: Boolean(input.listAsLawyer),
      },
      ipOrUserAgent: clientInfo(request),
    });

    const full = await getStaffProfile(firmId, profile.id);
    return jsonOk(
      { staff: full ? serializeStaff(full) : null },
      { status: 201 },
    );
  } catch (err) {
    return jsonError(err, request);
  }
}
