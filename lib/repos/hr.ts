/**
 * HR staff profiles and contracts (Phase 6 P6-12).
 */
import { and, asc, desc, eq, ne } from "drizzle-orm";
import { AuthError } from "@/lib/auth/types";
import { getDb } from "@/lib/db";
import { hrContracts, hrStaffProfiles, users } from "@/lib/db/schema";
import type { HrContractInput, StaffProfileInput } from "@/lib/hr/validation";
import { deleteFirmFile } from "@/lib/storage/firm-files";

export async function listStaffProfiles(
  firmId: string,
  opts?: { activeOnly?: boolean },
) {
  const db = getDb();
  const conditions = [eq(hrStaffProfiles.firmId, firmId)];
  if (opts?.activeOnly) {
    conditions.push(eq(hrStaffProfiles.isActive, true));
  }

  return db
    .select({
      profile: hrStaffProfiles,
      userEmail: users.email,
      userFullName: users.fullName,
      userIsActive: users.isActive,
      userIsLawyer: users.isLawyer,
      userIsSystemUser: users.isSystemUser,
    })
    .from(hrStaffProfiles)
    .leftJoin(users, and(eq(users.id, hrStaffProfiles.userId), eq(users.firmId, firmId)))
    .where(and(...conditions))
    .orderBy(desc(hrStaffProfiles.isActive), asc(hrStaffProfiles.fullName));
}

export async function getStaffProfile(firmId: string, id: string) {
  const db = getDb();
  const rows = await db
    .select({
      profile: hrStaffProfiles,
      userEmail: users.email,
      userFullName: users.fullName,
      userIsActive: users.isActive,
      userIsLawyer: users.isLawyer,
      userIsSystemUser: users.isSystemUser,
    })
    .from(hrStaffProfiles)
    .leftJoin(users, and(eq(users.id, hrStaffProfiles.userId), eq(users.firmId, firmId)))
    .where(and(eq(hrStaffProfiles.firmId, firmId), eq(hrStaffProfiles.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listLinkableUsers(firmId: string) {
  const db = getDb();
  return db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      isActive: users.isActive,
      isLawyer: users.isLawyer,
      isSystemUser: users.isSystemUser,
      linkedProfileId: hrStaffProfiles.id,
    })
    .from(users)
    .leftJoin(
      hrStaffProfiles,
      and(eq(hrStaffProfiles.userId, users.id), eq(hrStaffProfiles.firmId, firmId)),
    )
    .where(eq(users.firmId, firmId))
    .orderBy(asc(users.fullName));
}

async function assertUserLinkable(firmId: string, userId: string, excludeProfileId?: string) {
  const db = getDb();
  const userRows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.firmId, firmId), eq(users.id, userId)))
    .limit(1);
  if (!userRows[0]) {
    throw new AuthError("validation", "Linked user not found in this firm.");
  }

  const linkRows = await db
    .select({ id: hrStaffProfiles.id })
    .from(hrStaffProfiles)
    .where(
      and(
        eq(hrStaffProfiles.firmId, firmId),
        eq(hrStaffProfiles.userId, userId),
        excludeProfileId ? ne(hrStaffProfiles.id, excludeProfileId) : undefined,
      ),
    )
    .limit(1);
  if (linkRows[0]) {
    throw new AuthError("validation", "This user is already linked to another HR staff record.");
  }
}

export async function getStaffProfileByUserId(firmId: string, userId: string) {
  const db = getDb();
  const rows = await db
    .select({
      profile: hrStaffProfiles,
      userEmail: users.email,
      userFullName: users.fullName,
      userIsActive: users.isActive,
    })
    .from(hrStaffProfiles)
    .leftJoin(users, and(eq(users.id, hrStaffProfiles.userId), eq(users.firmId, firmId)))
    .where(and(eq(hrStaffProfiles.firmId, firmId), eq(hrStaffProfiles.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function createStaffProfile(firmId: string, input: StaffProfileInput) {
  if (input.userId) {
    await assertUserLinkable(firmId, input.userId);
  }

  const db = getDb();
  const rows = await db
    .insert(hrStaffProfiles)
    .values({
      firmId,
      userId: input.userId,
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
      jobTitle: input.jobTitle,
      department: input.department,
      startDate: input.startDate,
      endDate: input.endDate,
      emergencyContactName: input.emergencyContactName,
      emergencyContactPhone: input.emergencyContactPhone,
      isActive: input.isActive,
      annualLeaveEntitlementDays: input.annualLeaveEntitlementDays,
      notes: input.notes,
      updatedAt: new Date(),
    })
    .returning();
  return rows[0]!;
}

export async function updateStaffProfile(
  firmId: string,
  id: string,
  input: StaffProfileInput,
) {
  const existing = await getStaffProfile(firmId, id);
  if (!existing) {
    throw new AuthError("not_found", "Staff record not found.");
  }

  if (input.userId) {
    await assertUserLinkable(firmId, input.userId, id);
  }

  const db = getDb();
  const rows = await db
    .update(hrStaffProfiles)
    .set({
      userId: input.userId,
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
      jobTitle: input.jobTitle,
      department: input.department,
      startDate: input.startDate,
      endDate: input.endDate,
      emergencyContactName: input.emergencyContactName,
      emergencyContactPhone: input.emergencyContactPhone,
      isActive: input.isActive,
      annualLeaveEntitlementDays: input.annualLeaveEntitlementDays,
      notes: input.notes,
      updatedAt: new Date(),
    })
    .where(and(eq(hrStaffProfiles.firmId, firmId), eq(hrStaffProfiles.id, id)))
    .returning();
  return rows[0] ?? null;
}

export async function listHrContracts(
  firmId: string,
  opts?: { staffProfileId?: string; status?: string },
) {
  const db = getDb();
  const conditions = [eq(hrContracts.firmId, firmId)];
  if (opts?.staffProfileId) {
    conditions.push(eq(hrContracts.staffProfileId, opts.staffProfileId));
  }
  if (opts?.status) {
    conditions.push(eq(hrContracts.status, opts.status));
  }

  return db
    .select({
      contract: hrContracts,
      staffName: hrStaffProfiles.fullName,
      staffIsActive: hrStaffProfiles.isActive,
    })
    .from(hrContracts)
    .innerJoin(
      hrStaffProfiles,
      and(eq(hrStaffProfiles.id, hrContracts.staffProfileId), eq(hrStaffProfiles.firmId, firmId)),
    )
    .where(and(...conditions))
    .orderBy(desc(hrContracts.startDate), desc(hrContracts.createdAt));
}

export async function getHrContract(firmId: string, id: string) {
  const db = getDb();
  const rows = await db
    .select({
      contract: hrContracts,
      staffName: hrStaffProfiles.fullName,
      staffIsActive: hrStaffProfiles.isActive,
    })
    .from(hrContracts)
    .innerJoin(
      hrStaffProfiles,
      and(eq(hrStaffProfiles.id, hrContracts.staffProfileId), eq(hrStaffProfiles.firmId, firmId)),
    )
    .where(and(eq(hrContracts.firmId, firmId), eq(hrContracts.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export async function createHrContract(firmId: string, input: HrContractInput) {
  const staff = await getStaffProfile(firmId, input.staffProfileId);
  if (!staff) {
    throw new AuthError("validation", "Staff record not found.");
  }

  const db = getDb();
  const rows = await db
    .insert(hrContracts)
    .values({
      firmId,
      staffProfileId: input.staffProfileId,
      title: input.title,
      startDate: input.startDate,
      endDate: input.endDate,
      status: input.status,
      notes: input.notes,
      updatedAt: new Date(),
    })
    .returning();
  return rows[0]!;
}

export async function updateHrContract(
  firmId: string,
  id: string,
  input: HrContractInput,
) {
  const existing = await getHrContract(firmId, id);
  if (!existing) {
    throw new AuthError("not_found", "Contract not found.");
  }

  const staff = await getStaffProfile(firmId, input.staffProfileId);
  if (!staff) {
    throw new AuthError("validation", "Staff record not found.");
  }

  const db = getDb();
  const rows = await db
    .update(hrContracts)
    .set({
      staffProfileId: input.staffProfileId,
      title: input.title,
      startDate: input.startDate,
      endDate: input.endDate,
      status: input.status,
      notes: input.notes,
      updatedAt: new Date(),
    })
    .where(and(eq(hrContracts.firmId, firmId), eq(hrContracts.id, id)))
    .returning();
  return rows[0] ?? null;
}

export async function deleteHrContract(firmId: string, id: string) {
  const existing = await getHrContract(firmId, id);
  if (!existing) {
    throw new AuthError("not_found", "Contract not found.");
  }

  if (existing.contract.contractDocumentPath) {
    try {
      await deleteFirmFile(existing.contract.contractDocumentPath, firmId);
    } catch {
      /* best effort */
    }
  }

  const db = getDb();
  const rows = await db
    .delete(hrContracts)
    .where(and(eq(hrContracts.firmId, firmId), eq(hrContracts.id, id)))
    .returning();
  return rows[0] ?? null;
}

export async function setHrContractDocument(
  firmId: string,
  contractId: string,
  fileName: string,
  storagePath: string,
) {
  const db = getDb();
  const rows = await db
    .update(hrContracts)
    .set({
      contractDocumentName: fileName,
      contractDocumentPath: storagePath,
      updatedAt: new Date(),
    })
    .where(and(eq(hrContracts.firmId, firmId), eq(hrContracts.id, contractId)))
    .returning();
  return rows[0] ?? null;
}
