/**
 * Delegation grants: temporary capability overlay (Phase 10).
 */
import "server-only";

import { and, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { AuthError } from "@/lib/auth/types";
import { getDb } from "@/lib/db";
import { delegationGrants, users } from "@/lib/db/schema";
import type { PermissionCode } from "@/lib/db/types";

export const DELEGATION_CAPABILITIES = [
  {
    code: "invoice.approve" as const,
    label: "Approve invoices",
    description: "Approve fee invoices that are pending send.",
  },
  {
    code: "leave.approve" as const,
    label: "Approve leave",
    description: "Approve staff leave requests.",
  },
  {
    code: "payroll.advance.approve" as const,
    label: "Approve salary advances",
    description: "Approve salary advance requests.",
  },
  {
    code: "finance.requisitions.approve" as const,
    label: "Approve requisitions",
    description: "Approve or reject finance requisitions.",
  },
] as const;

export type DelegationCapabilityCode =
  (typeof DELEGATION_CAPABILITIES)[number]["code"];

const CAPABILITY_SET = new Set<string>(
  DELEGATION_CAPABILITIES.map((c) => c.code),
);

export function isDelegationCapability(code: string): code is DelegationCapabilityCode {
  return CAPABILITY_SET.has(code);
}

export async function listActiveDelegationCapabilities(
  firmId: string,
  granteeUserId: string,
): Promise<string[]> {
  const db = getDb();
  const now = new Date();
  const rows = await db
    .select({ capability: delegationGrants.capability })
    .from(delegationGrants)
    .where(
      and(
        eq(delegationGrants.firmId, firmId),
        eq(delegationGrants.granteeUserId, granteeUserId),
        isNull(delegationGrants.revokedAt),
        or(isNull(delegationGrants.expiresAt), gt(delegationGrants.expiresAt, now)),
      ),
    );
  return [...new Set(rows.map((r) => r.capability))];
}

export async function listDelegationGrants(
  firmId: string,
  opts?: { activeOnly?: boolean },
) {
  const db = getDb();
  const activeOnly = opts?.activeOnly !== false;
  const conditions = [eq(delegationGrants.firmId, firmId)];
  if (activeOnly) conditions.push(isNull(delegationGrants.revokedAt));

  const rows = await db
    .select()
    .from(delegationGrants)
    .where(and(...conditions))
    .orderBy(desc(delegationGrants.createdAt));

  if (rows.length === 0) return [];

  const userIds = [
    ...new Set(rows.flatMap((r) => [r.grantorUserId, r.granteeUserId])),
  ];
  const people = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      email: users.email,
    })
    .from(users)
    .where(and(eq(users.firmId, firmId), inArray(users.id, userIds)));

  const byId = new Map(people.map((p) => [p.id, p]));
  const now = Date.now();

  return rows.map((r) => {
    const grantor = byId.get(r.grantorUserId);
    const grantee = byId.get(r.granteeUserId);
    const expired =
      Boolean(r.expiresAt) && r.expiresAt!.getTime() <= now && !r.revokedAt;
    return {
      id: r.id,
      capability: r.capability,
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt?.toISOString() ?? null,
      revokedAt: r.revokedAt?.toISOString() ?? null,
      grantorUserId: r.grantorUserId,
      granteeUserId: r.granteeUserId,
      grantorName: grantor?.fullName ?? "Unknown",
      granteeName: grantee?.fullName ?? "Unknown",
      granteeEmail: grantee?.email ?? "",
      status: r.revokedAt ? "revoked" : expired ? "expired" : "active",
      label:
        DELEGATION_CAPABILITIES.find((c) => c.code === r.capability)?.label ??
        r.capability,
    };
  });
}

export async function createDelegationGrant(input: {
  firmId: string;
  grantorUserId: string;
  granteeUserId: string;
  capability: string;
  expiresAt?: Date | null;
}) {
  if (!isDelegationCapability(input.capability)) {
    throw new AuthError(
      "validation",
      `Unknown capability. Allowed: ${[...CAPABILITY_SET].join(", ")}`,
    );
  }
  if (input.grantorUserId === input.granteeUserId) {
    throw new AuthError("validation", "You cannot delegate a capability to yourself.");
  }

  const db = getDb();
  const grantee = await db
    .select({
      id: users.id,
      isActive: users.isActive,
      isSystemUser: users.isSystemUser,
    })
    .from(users)
    .where(and(eq(users.firmId, input.firmId), eq(users.id, input.granteeUserId)))
    .limit(1);
  if (!grantee[0] || !grantee[0].isActive || !grantee[0].isSystemUser) {
    throw new AuthError(
      "validation",
      "Grantee must be an active system login in this firm.",
    );
  }

  const now = new Date();
  const existing = await db
    .select({ id: delegationGrants.id })
    .from(delegationGrants)
    .where(
      and(
        eq(delegationGrants.firmId, input.firmId),
        eq(delegationGrants.granteeUserId, input.granteeUserId),
        eq(delegationGrants.capability, input.capability),
        isNull(delegationGrants.revokedAt),
        or(isNull(delegationGrants.expiresAt), gt(delegationGrants.expiresAt, now)),
      ),
    )
    .limit(1);
  if (existing[0]) {
    throw new AuthError(
      "validation",
      "An active grant for this person and capability already exists. Revoke it first.",
    );
  }

  const [row] = await db
    .insert(delegationGrants)
    .values({
      firmId: input.firmId,
      grantorUserId: input.grantorUserId,
      granteeUserId: input.granteeUserId,
      capability: input.capability,
      expiresAt: input.expiresAt ?? null,
    })
    .returning();

  const { clearCachedUserPermissionCodes } = await import("@/lib/auth/hot-cache");
  clearCachedUserPermissionCodes(input.granteeUserId);

  return row;
}

export async function revokeDelegationGrant(input: {
  firmId: string;
  grantId: string;
  actorUserId: string;
}) {
  const db = getDb();
  const [row] = await db
    .update(delegationGrants)
    .set({
      revokedAt: new Date(),
      revokedByUserId: input.actorUserId,
    })
    .where(
      and(
        eq(delegationGrants.firmId, input.firmId),
        eq(delegationGrants.id, input.grantId),
        isNull(delegationGrants.revokedAt),
      ),
    )
    .returning();
  if (!row) throw new AuthError("not_found", "Active delegation grant not found.");

  const { clearCachedUserPermissionCodes } = await import("@/lib/auth/hot-cache");
  clearCachedUserPermissionCodes(row.granteeUserId);
  return row;
}

export function hasDelegatedCapability(
  permissions: readonly string[],
  capability: PermissionCode | string,
): boolean {
  return permissions.includes(capability);
}
