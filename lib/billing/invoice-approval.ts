/**
 * Invoice pre-send approval (Phase 10 P10-07).
 * AR status stays draft until Mark sent; GL posts only on Sent.
 */
import "server-only";

import { and, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { AuthError } from "@/lib/auth/types";
import { getDb } from "@/lib/db";
import {
  delegationGrants,
  permissions,
  rolePermissions,
  userPermissions,
  users,
} from "@/lib/db/schema";
import {
  getFirmSetting,
  REQUIRE_INVOICE_APPROVAL_KEY,
  upsertFirmSetting,
} from "@/lib/repos/firm-settings";

export type InvoiceApprovalState = "none" | "pending" | "approved" | "rejected";

export const INVOICE_APPROVAL_STATES: InvoiceApprovalState[] = [
  "none",
  "pending",
  "approved",
  "rejected",
];

export function isInvoiceApprovalState(value: unknown): value is InvoiceApprovalState {
  return (
    typeof value === "string" &&
    INVOICE_APPROVAL_STATES.includes(value as InvoiceApprovalState)
  );
}

/** Default ON for pilot: missing key or anything other than "false" means required. */
export async function getRequireInvoiceApproval(firmId: string): Promise<boolean> {
  const raw = await getFirmSetting(firmId, REQUIRE_INVOICE_APPROVAL_KEY);
  return raw !== "false";
}

export async function setRequireInvoiceApproval(
  firmId: string,
  required: boolean,
): Promise<void> {
  await upsertFirmSetting(
    firmId,
    REQUIRE_INVOICE_APPROVAL_KEY,
    required ? "true" : "false",
  );
}

export type InvoiceApprovalAction = "submit" | "approve" | "reject";

export function parseInvoiceApprovalAction(body: unknown): {
  action: InvoiceApprovalAction;
  rejectionNote: string | null;
} {
  if (!body || typeof body !== "object") {
    throw new AuthError("validation", "Invalid approval payload.");
  }
  const raw = body as Record<string, unknown>;
  const action = raw.action;
  if (action !== "submit" && action !== "approve" && action !== "reject") {
    throw new AuthError(
      "validation",
      "action must be submit, approve, or reject.",
    );
  }
  let rejectionNote: string | null = null;
  if (action === "reject") {
    const note =
      typeof raw.rejectionNote === "string"
        ? raw.rejectionNote.trim()
        : typeof raw.note === "string"
          ? raw.note.trim()
          : "";
    rejectionNote = note || null;
  }
  return { action, rejectionNote };
}

export function assertApprovalTransition(
  from: string,
  action: InvoiceApprovalAction,
): InvoiceApprovalState {
  const state = (isInvoiceApprovalState(from) ? from : "none") as InvoiceApprovalState;
  if (action === "submit") {
    if (state !== "none" && state !== "rejected") {
      throw new AuthError(
        "validation",
        "Only draft invoices that are not already pending or approved can be submitted.",
      );
    }
    return "pending";
  }
  if (action === "approve") {
    if (state !== "pending") {
      throw new AuthError("validation", "Only pending invoices can be approved.");
    }
    return "approved";
  }
  if (state !== "pending") {
    throw new AuthError("validation", "Only pending invoices can be rejected.");
  }
  return "rejected";
}

/**
 * Active system users who can approve invoices (role defaults, ticks, or delegation).
 */
export async function listInvoiceApproverUserIds(firmId: string): Promise<string[]> {
  const db = getDb();
  const now = new Date();

  const activeLogins = await db
    .select({
      id: users.id,
      roleId: users.roleId,
    })
    .from(users)
    .where(
      and(
        eq(users.firmId, firmId),
        eq(users.isActive, true),
        eq(users.isSystemUser, true),
      ),
    );
  if (activeLogins.length === 0) return [];

  const roleIds = [...new Set(activeLogins.map((u) => u.roleId))];
  const rolesWithApprove = await db
    .select({ roleId: rolePermissions.roleId })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(
      and(
        inArray(rolePermissions.roleId, roleIds),
        eq(permissions.code, "invoice.approve"),
      ),
    );
  const roleApproveSet = new Set(rolesWithApprove.map((r) => r.roleId));

  const loginIds = activeLogins.map((u) => u.id);
  const tickRows = await db
    .select({
      userId: userPermissions.userId,
      code: permissions.code,
    })
    .from(userPermissions)
    .innerJoin(permissions, eq(userPermissions.permissionId, permissions.id))
    .where(inArray(userPermissions.userId, loginIds));

  const usersWithCustomTicks = new Set(tickRows.map((r) => r.userId));
  const usersWithApproveTick = new Set(
    tickRows.filter((r) => r.code === "invoice.approve").map((r) => r.userId),
  );

  const delegated = await db
    .select({ id: delegationGrants.granteeUserId })
    .from(delegationGrants)
    .where(
      and(
        eq(delegationGrants.firmId, firmId),
        eq(delegationGrants.capability, "invoice.approve"),
        isNull(delegationGrants.revokedAt),
        or(isNull(delegationGrants.expiresAt), gt(delegationGrants.expiresAt, now)),
        inArray(delegationGrants.granteeUserId, loginIds),
      ),
    );
  const delegatedSet = new Set(delegated.map((d) => d.id));

  const out = new Set<string>();
  for (const u of activeLogins) {
    if (delegatedSet.has(u.id)) {
      out.add(u.id);
      continue;
    }
    if (usersWithCustomTicks.has(u.id)) {
      if (usersWithApproveTick.has(u.id)) out.add(u.id);
      continue;
    }
    if (roleApproveSet.has(u.roleId)) out.add(u.id);
  }
  return [...out];
}

export async function notifyInvoiceApprovers(input: {
  firmId: string;
  invoiceId: string;
  invoiceNumber: string;
  excludeUserId?: string | null;
}) {
  const { notifyStaffEvent } = await import("@/lib/notifications/notify-staff-event");
  const ids = await listInvoiceApproverUserIds(input.firmId);
  const targets = ids.filter((id) => id !== input.excludeUserId);
  const href = `/finance/invoicing/invoices/${input.invoiceId}`;
  await notifyStaffEvent({
    firmId: input.firmId,
    userIds: targets,
    subject: `LexZim: Invoice ${input.invoiceNumber} awaits approval`,
    body: `Fee note ${input.invoiceNumber} was submitted for approval. Please approve or reject in LexZim.`,
    inApp: {
      type: "invoice.approval_pending",
      title: `Invoice ${input.invoiceNumber} awaits approval`,
      body:
        targets.length === 0
          ? "Submit for approval is complete. An approver should review this fee note."
          : "Please approve or reject this fee note.",
      href,
      metadata: { invoiceId: input.invoiceId },
    },
    broadcastInAppIfEmpty: true,
  });
}

export async function notifyInvoiceCreator(input: {
  firmId: string;
  creatorUserId: string | null | undefined;
  invoiceId: string;
  invoiceNumber: string;
  outcome: "approved" | "rejected";
  rejectionNote?: string | null;
  actorUserId: string;
}) {
  if (!input.creatorUserId || input.creatorUserId === input.actorUserId) return;
  const { createStaffNotification } = await import("@/lib/notifications/staff");
  await createStaffNotification({
    firmId: input.firmId,
    userId: input.creatorUserId,
    type:
      input.outcome === "approved"
        ? "invoice.approval_approved"
        : "invoice.approval_rejected",
    title:
      input.outcome === "approved"
        ? `Invoice ${input.invoiceNumber} approved`
        : `Invoice ${input.invoiceNumber} rejected`,
    body:
      input.outcome === "approved"
        ? "Ready to mark as sent when you are ready."
        : input.rejectionNote || "Please revise and resubmit for approval.",
    href: `/finance/invoicing/invoices/${input.invoiceId}`,
    metadata: { invoiceId: input.invoiceId, outcome: input.outcome },
  });
}
