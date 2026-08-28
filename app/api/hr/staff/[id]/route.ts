import { writeAuditLog } from "@/lib/auth/audit";
import { AuthError } from "@/lib/auth/types";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { parseStaffProfileInput } from "@/lib/hr/validation";
import { createDirectoryPerson } from "@/lib/repos/directory-people";
import { getStaffProfile, updateStaffProfile } from "@/lib/repos/hr";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

function serializeStaff(row: NonNullable<Awaited<ReturnType<typeof getStaffProfile>>>) {
  const p = row.profile;
  return {
    id: p.id,
    fullName: p.fullName,
    email: p.email,
    phone: p.phone,
    jobTitle: p.jobTitle,
    jobCategory: p.jobCategory,
    department: p.department,
    employeeNumber: p.employeeNumber,
    idPassport: p.idPassport,
    workLocation: p.workLocation,
    startDate: p.startDate?.toISOString() ?? null,
    endDate: p.endDate?.toISOString() ?? null,
    emergencyContactName: p.emergencyContactName,
    emergencyContactPhone: p.emergencyContactPhone,
    nokFullName: p.nokFullName,
    nokRelationship: p.nokRelationship,
    nokPhone1: p.nokPhone1,
    nokPhone2: p.nokPhone2,
    nokAddress: p.nokAddress,
    nokEmail: p.nokEmail,
    nokOccupation: p.nokOccupation,
    nokDeclaredAt: p.nokDeclaredAt?.toISOString() ?? null,
    nokReceivedAt: p.nokReceivedAt?.toISOString() ?? null,
    grossSalaryCents: p.grossSalaryCents,
    netSalaryCents: p.netSalaryCents,
    isActive: p.isActive,
    annualLeaveEntitlementDays: p.annualLeaveEntitlementDays,
    notes: p.notes,
    userId: p.userId,
    userEmail: row.userEmail,
    userFullName: row.userFullName,
    userIsActive: row.userIsActive,
    userIsLawyer: row.userIsLawyer,
    userIsSystemUser: row.userIsSystemUser,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("hr.view");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const row = await getStaffProfile(firmId, id);
    if (!row) {
      throw new AuthError("not_found", "Staff record not found.");
    }
    return jsonOk({ staff: serializeStaff(row) });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("hr.manage");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const body = await request.json();
    const input = parseStaffProfileInput(body);

    const existing = await getStaffProfile(firmId, id);
    if (!existing) {
      throw new AuthError("not_found", "Staff record not found.");
    }

    let userId = input.userId;
    if (!userId && !existing.profile.userId && input.listAsLawyer) {
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
          source: "hr_staff_update",
          isLawyer: true,
        },
        ipOrUserAgent: clientInfo(request),
      });
    }

    const profile = await updateStaffProfile(firmId, id, { ...input, userId });
    if (!profile) {
      throw new AuthError("not_found", "Staff record not found.");
    }

    await writeAuditLog({
      action: "hr_staff.update",
      firmId,
      userId: session.id,
      entityType: "hr_staff_profile",
      entityId: profile.id,
      metadata: {
        fullName: profile.fullName,
        userId: profile.userId,
        isActive: profile.isActive,
        jobCategory: profile.jobCategory,
        listAsLawyer: Boolean(input.listAsLawyer),
        nokUpdated: Boolean(input.nokFullName || input.nokPhone1),
      },
      ipOrUserAgent: clientInfo(request),
    });

    const full = await getStaffProfile(firmId, profile.id);
    return jsonOk({ staff: full ? serializeStaff(full) : null });
  } catch (err) {
    return jsonError(err, request);
  }
}
