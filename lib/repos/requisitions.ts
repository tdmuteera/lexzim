/**
 * Finance requisitions (P11-07): Business + Disbursement request → approve → pay.
 */
import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { AuthError } from "@/lib/auth/types";
import { clientDisplayName } from "@/lib/clients/display";
import { getDb } from "@/lib/db";
import {
  clients,
  financeRequisitions,
  matters,
  users,
} from "@/lib/db/schema";
import { requisitionApprovalTier } from "@/lib/finance/requisition-constants";
import { evaluateTrustShortfallForFirm } from "@/lib/finance/trust-shortfall-policy";
import type {
  RequisitionCreateInput,
  RequisitionPayInput,
  RequisitionStatus,
  RequisitionType,
} from "@/lib/finance/requisition-validation";
import { isExpenseCategoryOrGlCode } from "@/lib/finance/expense-gl-tree";
import { listUsersWithPermissionCode } from "@/lib/hr/approver-users";
import { createStaffNotification } from "@/lib/notifications/staff";
import { createDisbursement } from "@/lib/repos/billing";
import { createFirmExpense } from "@/lib/repos/firm-finance";
import {
  getClientTrustBalance,
  getTrustAccount,
  listTrustAccounts,
  postTrustLedgerEntry,
} from "@/lib/repos/trust";

export type RequisitionListFilters = {
  type?: RequisitionType;
  status?: RequisitionStatus;
  clientId?: string;
  matterId?: string;
  limit?: number;
};

function serializeJoined(row: {
  requisition: typeof financeRequisitions.$inferSelect;
  clientType: string | null;
  clientFullName: string | null;
  clientLegalName: string | null;
  clientTradingName: string | null;
  clientNumber: string | null;
  matterTitle: string | null;
  matterNumber: string | null;
  requesterName: string | null;
}) {
  const r = row.requisition;
  return {
    ...r,
    clientName:
      row.clientType != null
        ? clientDisplayName({
            clientType: row.clientType,
            fullName: row.clientFullName,
            legalName: row.clientLegalName,
            tradingName: row.clientTradingName,
          })
        : null,
    clientNumber: row.clientNumber,
    matterTitle: row.matterTitle,
    matterNumber: row.matterNumber,
    requesterName: row.requesterName,
  };
}

async function assertMatterClient(
  firmId: string,
  matterId: string,
  clientId: string,
) {
  const db = getDb();
  const rows = await db
    .select({ id: matters.id, clientId: matters.clientId })
    .from(matters)
    .where(and(eq(matters.firmId, firmId), eq(matters.id, matterId)))
    .limit(1);
  const matter = rows[0];
  if (!matter) throw new AuthError("validation", "Matter not found.");
  if (matter.clientId !== clientId) {
    throw new AuthError("validation", "Matter does not belong to the selected client.");
  }
}

export async function listRequisitions(
  firmId: string,
  filters: RequisitionListFilters = {},
) {
  const db = getDb();
  const conditions = [eq(financeRequisitions.firmId, firmId)];
  if (filters.type) conditions.push(eq(financeRequisitions.type, filters.type));
  if (filters.status) conditions.push(eq(financeRequisitions.status, filters.status));
  if (filters.clientId) {
    conditions.push(eq(financeRequisitions.clientId, filters.clientId));
  }
  if (filters.matterId) {
    conditions.push(eq(financeRequisitions.matterId, filters.matterId));
  }

  const rows = await db
    .select({
      requisition: financeRequisitions,
      clientType: clients.clientType,
      clientFullName: clients.fullName,
      clientLegalName: clients.legalName,
      clientTradingName: clients.tradingName,
      clientNumber: clients.clientNumber,
      matterTitle: matters.title,
      matterNumber: matters.matterNumber,
      requesterName: users.fullName,
    })
    .from(financeRequisitions)
    .leftJoin(
      clients,
      and(eq(clients.id, financeRequisitions.clientId), eq(clients.firmId, firmId)),
    )
    .leftJoin(
      matters,
      and(eq(matters.id, financeRequisitions.matterId), eq(matters.firmId, firmId)),
    )
    .leftJoin(users, eq(users.id, financeRequisitions.requestedBy))
    .where(and(...conditions))
    .orderBy(desc(financeRequisitions.createdAt))
    .limit(Math.min(Math.max(filters.limit ?? 100, 1), 300));

  return rows.map(serializeJoined);
}

export async function listPendingApprovalRequisitions(firmId: string, limit = 50) {
  return listRequisitions(firmId, { status: "pending_approval", limit });
}

export async function getRequisition(firmId: string, id: string) {
  const db = getDb();
  const direct = await db
    .select({
      requisition: financeRequisitions,
      clientType: clients.clientType,
      clientFullName: clients.fullName,
      clientLegalName: clients.legalName,
      clientTradingName: clients.tradingName,
      clientNumber: clients.clientNumber,
      matterTitle: matters.title,
      matterNumber: matters.matterNumber,
      requesterName: users.fullName,
    })
    .from(financeRequisitions)
    .leftJoin(
      clients,
      and(eq(clients.id, financeRequisitions.clientId), eq(clients.firmId, firmId)),
    )
    .leftJoin(
      matters,
      and(eq(matters.id, financeRequisitions.matterId), eq(matters.firmId, firmId)),
    )
    .leftJoin(users, eq(users.id, financeRequisitions.requestedBy))
    .where(and(eq(financeRequisitions.firmId, firmId), eq(financeRequisitions.id, id)))
    .limit(1);
  return direct[0] ? serializeJoined(direct[0]) : null;
}

export async function createRequisition(
  firmId: string,
  userId: string,
  input: RequisitionCreateInput,
) {
  if (input.type === "disbursement") {
    await assertMatterClient(firmId, input.matterId!, input.clientId!);
  }

  const status: RequisitionStatus = input.submit ? "pending_approval" : "draft";
  const db = getDb();
  const [row] = await db
    .insert(financeRequisitions)
    .values({
      firmId,
      type: input.type,
      status,
      clientId: input.clientId,
      matterId: input.matterId,
      nature: input.nature,
      description: input.description,
      amountCents: input.amountCents,
      currency: input.currency,
      requestedBy: userId,
      updatedAt: new Date(),
    })
    .returning();

  if (status === "pending_approval") {
    await notifyRequisitionApprovers({
      firmId,
      requisitionId: row!.id,
      type: input.type,
      amountCents: input.amountCents,
      currency: input.currency,
      excludeUserId: userId,
    });
  }

  return getRequisition(firmId, row!.id);
}

export async function notifyRequisitionApprovers(input: {
  firmId: string;
  requisitionId: string;
  type: string;
  amountCents: number;
  currency: string;
  excludeUserId?: string | null;
}) {
  const ids = await listUsersWithPermissionCode(
    input.firmId,
    "finance.requisitions.approve",
  );
  const targets = ids.filter((id) => id !== input.excludeUserId);
  const amount = (input.amountCents / 100).toFixed(2);
  const title = `${input.type === "business" ? "Business" : "Disbursement"} requisition awaits approval`;
  const body = `${input.currency} ${amount}. Review in Finance → Requisitions.`;
  const href = `/finance/requisitions?id=${input.requisitionId}`;
  const { notifyStaffEvent } = await import("@/lib/notifications/notify-staff-event");
  await notifyStaffEvent({
    firmId: input.firmId,
    userIds: targets,
    subject: `LexZim: ${title}`,
    body,
    inApp: {
      type: "requisition.approval_pending",
      title,
      body,
      href,
      metadata: { requisitionId: input.requisitionId },
    },
    broadcastInAppIfEmpty: true,
  });
}

async function notifyRequester(input: {
  firmId: string;
  requesterUserId: string;
  actorUserId: string;
  requisitionId: string;
  outcome: "approved" | "rejected" | "paid" | "cancelled";
  note?: string | null;
}) {
  if (input.requesterUserId === input.actorUserId) return;
  await createStaffNotification({
    firmId: input.firmId,
    userId: input.requesterUserId,
    type: `requisition.${input.outcome}`,
    title: `Requisition ${input.outcome.replace(/_/g, " ")}`,
    body: input.note || `Your requisition was ${input.outcome}.`,
    href: `/finance/requisitions?id=${input.requisitionId}`,
    metadata: { requisitionId: input.requisitionId },
  });
}

export async function submitRequisition(
  firmId: string,
  userId: string,
  id: string,
) {
  const existing = await getRequisition(firmId, id);
  if (!existing) throw new AuthError("not_found", "Requisition not found.");
  if (existing.status !== "draft" && existing.status !== "rejected") {
    throw new AuthError("validation", "Only draft or rejected requisitions can be submitted.");
  }
  const db = getDb();
  await db
    .update(financeRequisitions)
    .set({
      status: "pending_approval",
      rejectedBy: null,
      rejectedAt: null,
      rejectionNote: null,
      updatedAt: new Date(),
    })
    .where(and(eq(financeRequisitions.firmId, firmId), eq(financeRequisitions.id, id)));

  await notifyRequisitionApprovers({
    firmId,
    requisitionId: id,
    type: existing.type,
    amountCents: existing.amountCents,
    currency: existing.currency,
    excludeUserId: userId,
  });

  return getRequisition(firmId, id);
}

export async function approveRequisition(
  firmId: string,
  userId: string,
  id: string,
  opts: { isManagingPartner: boolean },
) {
  const existing = await getRequisition(firmId, id);
  if (!existing) throw new AuthError("not_found", "Requisition not found.");
  if (existing.status !== "pending_approval") {
    throw new AuthError("validation", "Only pending requisitions can be approved.");
  }

  let trustBalanceCents: number | null = null;
  if (existing.type === "disbursement" && existing.clientId) {
    trustBalanceCents = await getClientTrustBalance(firmId, existing.clientId, {
      matterId: existing.matterId ?? undefined,
    });
  }
  const tier = requisitionApprovalTier({
    type: existing.type as "business" | "disbursement",
    amountCents: existing.amountCents,
    paidFrom: null,
    trustBalanceCents,
  });
  if (tier.requiresManagingPartner && !opts.isManagingPartner) {
    throw new AuthError(
      "forbidden",
      `Managing Partner approval required. ${tier.reason}`,
    );
  }

  const db = getDb();
  await db
    .update(financeRequisitions)
    .set({
      status: "approved",
      approvedBy: userId,
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(financeRequisitions.firmId, firmId), eq(financeRequisitions.id, id)));

  await notifyRequester({
    firmId,
    requesterUserId: existing.requestedBy,
    actorUserId: userId,
    requisitionId: id,
    outcome: "approved",
  });

  return getRequisition(firmId, id);
}

export async function rejectRequisition(
  firmId: string,
  userId: string,
  id: string,
  rejectionNote: string | null,
) {
  const existing = await getRequisition(firmId, id);
  if (!existing) throw new AuthError("not_found", "Requisition not found.");
  if (existing.status !== "pending_approval") {
    throw new AuthError("validation", "Only pending requisitions can be rejected.");
  }

  const db = getDb();
  await db
    .update(financeRequisitions)
    .set({
      status: "rejected",
      rejectedBy: userId,
      rejectedAt: new Date(),
      rejectionNote,
      updatedAt: new Date(),
    })
    .where(and(eq(financeRequisitions.firmId, firmId), eq(financeRequisitions.id, id)));

  await notifyRequester({
    firmId,
    requesterUserId: existing.requestedBy,
    actorUserId: userId,
    requisitionId: id,
    outcome: "rejected",
    note: rejectionNote,
  });

  return getRequisition(firmId, id);
}

export async function cancelRequisition(
  firmId: string,
  userId: string,
  id: string,
) {
  const existing = await getRequisition(firmId, id);
  if (!existing) throw new AuthError("not_found", "Requisition not found.");
  if (
    existing.status !== "draft" &&
    existing.status !== "pending_approval" &&
    existing.status !== "approved" &&
    existing.status !== "rejected"
  ) {
    throw new AuthError("validation", "Paid requisitions cannot be cancelled.");
  }

  const db = getDb();
  await db
    .update(financeRequisitions)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(financeRequisitions.firmId, firmId), eq(financeRequisitions.id, id)));

  await notifyRequester({
    firmId,
    requesterUserId: existing.requestedBy,
    actorUserId: userId,
    requisitionId: id,
    outcome: "cancelled",
  });

  return getRequisition(firmId, id);
}

export type PayRequisitionResult = {
  requisition: NonNullable<Awaited<ReturnType<typeof getRequisition>>>;
  trustShortfallWarning: string | null;
};

export async function payRequisition(
  firmId: string,
  userId: string,
  id: string,
  input: RequisitionPayInput,
  opts: { isManagingPartner: boolean },
): Promise<PayRequisitionResult> {
  const existing = await getRequisition(firmId, id);
  if (!existing) throw new AuthError("not_found", "Requisition not found.");
  if (existing.status !== "approved") {
    throw new AuthError("validation", "Only approved requisitions can be paid.");
  }

  let trustShortfallWarning: string | null = null;
  let trustBalanceCents: number | null = null;

  if (existing.type === "business") {
    if (input.paidFrom !== "operating") {
      throw new AuthError(
        "validation",
        "Business requisitions are paid from operating (firm) funds.",
      );
    }
    const category =
      existing.nature && isExpenseCategoryOrGlCode(existing.nature)
        ? existing.nature
        : "9070";
    const expense = await createFirmExpense(firmId, userId, {
      expenseDate: new Date(),
      category,
      payee: existing.description.slice(0, 120),
      amountCents: existing.amountCents,
      currency: existing.currency,
      matterId: null,
      paymentMethod: input.paymentRef,
      notes: [
        `Requisition ${id.slice(0, 8)}`,
        existing.nature && category === "9070" ? `Nature: ${existing.nature}` : null,
        existing.description,
      ]
        .filter(Boolean)
        .join(". "),
      glAccountId: null,
      paymentSource: "cash",
      budgetMonth: null,
    });

    const db = getDb();
    await db
      .update(financeRequisitions)
      .set({
        status: "paid",
        paidAt: new Date(),
        paidBy: userId,
        paidFrom: "operating",
        paymentRef: input.paymentRef,
        recoverable: false,
        expenseId: expense.id,
        updatedAt: new Date(),
      })
      .where(and(eq(financeRequisitions.firmId, firmId), eq(financeRequisitions.id, id)));
  } else {
    if (!existing.clientId || !existing.matterId) {
      throw new AuthError("validation", "Disbursement requisition is missing client/matter.");
    }
    trustBalanceCents = await getClientTrustBalance(firmId, existing.clientId, {
      matterId: existing.matterId,
    });

    let paidFrom = input.paidFrom;
    if (paidFrom === "operating") {
      throw new AuthError(
        "validation",
        "Disbursement requisitions use trust or firm_float (not operating expense).",
      );
    }

    const shortfall = await evaluateTrustShortfallForFirm(
      firmId,
      existing.amountCents,
      trustBalanceCents,
    );

    if (paidFrom === "trust" && shortfall.isShort) {
      throw new AuthError(
        "validation",
        `${shortfall.message} Switch paidFrom to firm_float (if allowed) or top up trust.`,
      );
    }

    if (paidFrom === "firm_float") {
      if (shortfall.isShort && !shortfall.allowFirmFloat) {
        throw new AuthError(
          "validation",
          shortfall.message,
        );
      }
      if (shortfall.isShort) {
        trustShortfallWarning = shortfall.message;
      }
      const tier = requisitionApprovalTier({
        type: "disbursement",
        amountCents: existing.amountCents,
        paidFrom: "firm_float",
        trustBalanceCents,
      });
      if (tier.requiresManagingPartner && !opts.isManagingPartner) {
        throw new AuthError(
          "forbidden",
          `Managing Partner required to pay from firm float. ${tier.reason}`,
        );
      }
    }

    const disbursement = await createDisbursement(
      firmId,
      existing.matterId,
      userId,
      {
        description: existing.description,
        amountCents: existing.amountCents,
        currency: existing.currency,
        incurredAt: new Date(),
        billable: true,
        paidFrom: paidFrom === "trust" ? "trust" : "operating",
      },
    );

    if (paidFrom === "trust") {
      let trustAccountId = input.trustAccountId;
      if (!trustAccountId) {
        const accounts = await listTrustAccounts(firmId, true);
        const bank = accounts.find((a) => a.accountKind === "bank") ?? accounts[0];
        trustAccountId = bank?.id ?? null;
      }
      if (!trustAccountId) {
        throw new AuthError("validation", "No active trust account available for payment.");
      }
      const account = await getTrustAccount(firmId, trustAccountId);
      if (!account || !account.isActive) {
        throw new AuthError("validation", "Active trust account not found.");
      }
      await postTrustLedgerEntry(firmId, userId, {
        trustAccountId,
        matterId: existing.matterId,
        clientId: existing.clientId,
        entryType: "disbursement",
        amountCents: existing.amountCents,
        currency: existing.currency,
        occurredAt: new Date(),
        reference: input.paymentRef,
        referenceNumber: null,
        narrative: `Requisition pay: ${existing.description}`,
        transferToAccountId: null,
        adjustmentCredit: false,
        allowNegative: input.allowNegativeTrust,
      });
    }

    const db = getDb();
    await db
      .update(financeRequisitions)
      .set({
        status: "paid",
        paidAt: new Date(),
        paidBy: userId,
        paidFrom,
        paymentRef: input.paymentRef,
        recoverable: paidFrom === "firm_float",
        disbursementId: disbursement.id,
        updatedAt: new Date(),
      })
      .where(and(eq(financeRequisitions.firmId, firmId), eq(financeRequisitions.id, id)));
  }

  await notifyRequester({
    firmId,
    requesterUserId: existing.requestedBy,
    actorUserId: userId,
    requisitionId: id,
    outcome: "paid",
  });

  const requisition = await getRequisition(firmId, id);
  return { requisition: requisition!, trustShortfallWarning };
}

export async function getRequisitionPayPreview(firmId: string, id: string) {
  const existing = await getRequisition(firmId, id);
  if (!existing) throw new AuthError("not_found", "Requisition not found.");
  let trustBalanceCents: number | null = null;
  let shortfall = null as Awaited<ReturnType<typeof evaluateTrustShortfallForFirm>> | null;
  if (existing.type === "disbursement" && existing.clientId) {
    trustBalanceCents = await getClientTrustBalance(firmId, existing.clientId, {
      matterId: existing.matterId ?? undefined,
    });
    shortfall = await evaluateTrustShortfallForFirm(
      firmId,
      existing.amountCents,
      trustBalanceCents,
    );
  }
  const tier = requisitionApprovalTier({
    type: existing.type as "business" | "disbursement",
    amountCents: existing.amountCents,
    paidFrom: existing.type === "business" ? "operating" : "trust",
    trustBalanceCents,
  });
  return {
    requisition: existing,
    trustBalanceCents,
    shortfallCents: shortfall?.shortfallCents ?? null,
    shortfall,
    approvalTier: tier,
  };
}

export async function listRecoverableRequisitions(
  firmId: string,
  opts?: { clientId?: string; limit?: number },
) {
  const rows = await listRequisitions(firmId, {
    status: "paid",
    clientId: opts?.clientId,
    limit: opts?.limit ?? 100,
  });
  return rows.filter((r) => r.recoverable && r.type === "disbursement");
}

/** Mark a paid recoverable requisition as settled (client repaid / topped up). */
export async function settleRecoverableRequisition(
  firmId: string,
  userId: string,
  id: string,
) {
  const existing = await getRequisition(firmId, id);
  if (!existing) throw new AuthError("not_found", "Requisition not found.");
  if (existing.status !== "paid" || !existing.recoverable) {
    throw new AuthError(
      "validation",
      "Only paid recoverable disbursement requisitions can be settled.",
    );
  }
  const db = getDb();
  await db
    .update(financeRequisitions)
    .set({
      recoverable: false,
      paymentRef: existing.paymentRef
        ? `${existing.paymentRef} · settled`
        : "settled",
      updatedAt: new Date(),
    })
    .where(and(eq(financeRequisitions.firmId, firmId), eq(financeRequisitions.id, id)));

  await createStaffNotification({
    firmId,
    userId: existing.requestedBy === userId ? null : existing.requestedBy,
    type: "requisition.recoverable_settled",
    title: "Recoverable disbursement settled",
    body: existing.description,
    href: `/finance/requisitions?id=${id}`,
    metadata: { requisitionId: id },
  });

  return getRequisition(firmId, id);
}
