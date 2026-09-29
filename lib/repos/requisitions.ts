/**
 * Finance requisitions (P11-07): Business + Disbursement request → approve → pay.
 */
import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { AuthError } from "@/lib/auth/types";
import { clientDisplayName } from "@/lib/clients/display";
import { getDb, lockFinanceKey, runInTransaction } from "@/lib/db";
import {
  clients,
  disbursements,
  financeRequisitions,
  invoices,
  matters,
  users,
} from "@/lib/db/schema";
import { reverseJournalBySource } from "@/lib/gl/journals";
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
import { assertFloatCanPay, lockFloat, returnRecoveryToFloat } from "@/lib/repos/disbursement-float";
import { createFirmExpense, reverseFirmExpense } from "@/lib/repos/firm-finance";
import {
  assertTrustClientMatter,
  getClientTrustBalance,
  getTrustAccount,
  listTrustAccounts,
  lockClientTrust,
  postTrustLedgerEntry,
  reverseTrustEntry,
} from "@/lib/repos/trust";

export type RequisitionListFilters = {
  type?: RequisitionType;
  status?: RequisitionStatus;
  clientId?: string;
  matterId?: string;
  limit?: number;
};

async function userFullName(firmId: string, userId: string): Promise<string | null> {
  const db = getDb();
  const rows = await db
    .select({ fullName: users.fullName })
    .from(users)
    .where(and(eq(users.firmId, firmId), eq(users.id, userId)))
    .limit(1);
  return rows[0]?.fullName?.trim() || null;
}

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
      requesterName: await userFullName(firmId, userId),
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
  requesterName?: string | null;
  excludeUserId?: string | null;
}) {
  const ids = await listUsersWithPermissionCode(
    input.firmId,
    "finance.requisitions.approve",
  );
  const targets = ids.filter((id) => id !== input.excludeUserId);
  const amount = (input.amountCents / 100).toFixed(2);
  const kind = input.type === "business" ? "Business" : "Disbursement";
  const byWhom = input.requesterName?.trim() ? ` by ${input.requesterName.trim()}` : "";
  const title = `${kind} requisition awaits approval`;
  const body = `A ${kind.toLowerCase()} requisition${byWhom} needs approval (${input.currency} ${amount}). Open Finance → Requisitions.`;
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
  const { notifyStaffEvent } = await import("@/lib/notifications/notify-staff-event");
  const outcomeLabel = input.outcome.replace(/_/g, " ");
  const approvedBody =
    "Your requisition was approved. Funds are ready to collect. Open LexZim for details.";
  const body =
    input.outcome === "approved"
      ? approvedBody
      : input.note || `Your requisition was ${outcomeLabel}.`;
  await notifyStaffEvent({
    firmId: input.firmId,
    userIds: [input.requesterUserId],
    subject: `LexZim: Requisition ${outcomeLabel}`,
    body,
    inApp: {
      type: `requisition.${input.outcome}`,
      title: `Requisition ${outcomeLabel}`,
      body,
      href: `/finance/requisitions?id=${input.requisitionId}`,
      metadata: { requisitionId: input.requisitionId },
    },
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
    requesterName: existing.requesterName ?? (await userFullName(firmId, userId)),
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
  const result = await runInTransaction(async () => {
    await lockFinanceKey(`requisition:${firmId}:${id}`);
    return payRequisitionTx(firmId, userId, id, input, opts);
  });
  await notifyRequester({
    firmId,
    requesterUserId: result.requisition.requestedBy,
    actorUserId: userId,
    requisitionId: id,
    outcome: "paid",
  });
  return result;
}

async function markRequisitionPaid(
  firmId: string,
  id: string,
  patch: Partial<typeof financeRequisitions.$inferInsert>,
) {
  const rows = await getDb()
    .update(financeRequisitions)
    .set({ ...patch, status: "paid", updatedAt: new Date() })
    .where(
      and(
        eq(financeRequisitions.firmId, firmId),
        eq(financeRequisitions.id, id),
        eq(financeRequisitions.status, "approved"),
      ),
    )
    .returning({ id: financeRequisitions.id });
  if (!rows[0]) {
    throw new AuthError("validation", "This requisition was already paid or changed by someone else.");
  }
}

async function payRequisitionTx(
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

    await markRequisitionPaid(firmId, id, {
      paidAt: new Date(),
      paidBy: userId,
      paidFrom: "operating",
      paymentRef: input.paymentRef,
      recoverable: false,
      expenseId: expense.id,
    });
  } else {
    if (!existing.clientId || !existing.matterId) {
      throw new AuthError("validation", "Disbursement requisition is missing client/matter.");
    }
    const clientId = existing.clientId;
    const matterId = existing.matterId;
    await assertTrustClientMatter(firmId, clientId, matterId);

    const paidFrom = input.paidFrom;
    if (paidFrom === "operating") {
      throw new AuthError(
        "validation",
        "Disbursement requisitions use trust, firm_float or trust_then_float (not operating expense).",
      );
    }
    await lockClientTrust(firmId, clientId);

    let account: Awaited<ReturnType<typeof getTrustAccount>> | null = null;
    if (paidFrom !== "firm_float") {
      let trustAccountId = input.trustAccountId;
      if (!trustAccountId) {
        const accounts = await listTrustAccounts(firmId, true);
        trustAccountId = (accounts.find((a) => a.accountKind === "bank") ?? accounts[0])?.id ?? null;
      }
      account = trustAccountId ? await getTrustAccount(firmId, trustAccountId) : null;
      if (!account || !account.isActive) {
        throw new AuthError("validation", "No active trust account available for payment.");
      }
    }
    const trustBalanceCents = account
      ? await getClientTrustBalance(firmId, clientId, { trustAccountId: account.id })
      : await getClientTrustBalance(firmId, clientId);
    const shortfall = await evaluateTrustShortfallForFirm(
      firmId,
      existing.amountCents,
      trustBalanceCents,
    );

    const overdrawAuthorised =
      input.allowNegativeTrust && opts.isManagingPartner && Boolean(input.overrideReason);
    if (input.allowNegativeTrust && !opts.isManagingPartner) {
      throw new AuthError("forbidden", "Only the Managing Partner can authorise a trust overdraw.");
    }
    if (input.allowNegativeTrust && !input.overrideReason) {
      throw new AuthError("validation", "A reason is required to authorise a trust overdraw.");
    }

    let trustPart = 0;
    let floatPart = 0;
    if (paidFrom === "trust") {
      if (shortfall.isShort && !overdrawAuthorised) {
        throw new AuthError(
          "validation",
          `${shortfall.message} Use trust_then_float or firm_float (if allowed), or top up trust.`,
        );
      }
      trustPart = existing.amountCents;
    } else if (paidFrom === "firm_float") {
      floatPart = existing.amountCents;
    } else {
      trustPart = Math.min(Math.max(trustBalanceCents, 0), existing.amountCents);
      floatPart = existing.amountCents - trustPart;
    }

    if (floatPart > 0) {
      if (shortfall.isShort && !shortfall.allowFirmFloat) {
        throw new AuthError("validation", shortfall.message);
      }
      if (shortfall.isShort) trustShortfallWarning = shortfall.message;
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
      await lockFloat(firmId);
      await assertFloatCanPay(firmId, floatPart);
    }

    const db = getDb();
    let trustEntryId: string | null = null;
    let trustDisbursementId: string | null = null;
    let floatDisbursementId: string | null = null;

    if (trustPart > 0) {
      const posted = await postTrustLedgerEntry(firmId, userId, {
        trustAccountId: account!.id,
        matterId,
        clientId,
        entryType: "disbursement",
        amountCents: trustPart,
        currency: account!.currency,
        occurredAt: new Date(),
        reference: input.paymentRef,
        referenceNumber: null,
        narrative: `Requisition pay: ${existing.description}`,
        transferToAccountId: null,
        adjustmentCredit: false,
        allowNegative: overdrawAuthorised,
        overrideReason: input.overrideReason,
        authorisedBy: overdrawAuthorised ? userId : null,
        sourceType: "requisition",
        sourceId: id,
        requisitionId: id,
      });
      trustEntryId = posted.entries[0]!.id;
      // Paid with the client's own money: recorded for the matter but not billed again.
      const disb = await createDisbursement(
        firmId,
        matterId,
        userId,
        {
          description: existing.description,
          amountCents: trustPart,
          currency: existing.currency,
          incurredAt: new Date(),
          billable: false,
          paidFrom: "trust",
        },
        { trustPaidViaRequisition: true },
      );
      await db
        .update(disbursements)
        .set({ trustEntryId, requisitionId: id })
        .where(eq(disbursements.id, disb.id));
      trustDisbursementId = disb.id;
    }

    if (floatPart > 0) {
      const disb = await createDisbursement(
        firmId,
        matterId,
        userId,
        {
          description:
            trustPart > 0 ? `${existing.description} (balance from firm float)` : existing.description,
          amountCents: floatPart,
          currency: existing.currency,
          incurredAt: new Date(),
          billable: true,
          paidFrom: "firm_float",
        },
        { floatPaidViaRequisition: true },
      );
      await db
        .update(disbursements)
        .set({ requisitionId: id })
        .where(eq(disbursements.id, disb.id));
      floatDisbursementId = disb.id;
    }

    await markRequisitionPaid(firmId, id, {
      paidAt: new Date(),
      paidBy: userId,
      paidFrom,
      paymentRef: input.paymentRef,
      recoverable: floatPart > 0,
      disbursementId: floatDisbursementId ?? trustDisbursementId,
      trustEntryId,
    });
  }

  const requisition = await getRequisition(firmId, id);
  return { requisition: requisition!, trustShortfallWarning };
}

/**
 * Reverse a paid requisition (payment returned, paid in error). Managing Partner only.
 * Trust money goes back to the client, float advances and expenses are reversed in GL,
 * and the requisition is marked reversed with the reason. Blocks once billed.
 */
export async function reverseRequisitionPayment(
  firmId: string,
  userId: string,
  id: string,
  reason: string,
  opts: { isManagingPartner: boolean },
) {
  if (!opts.isManagingPartner) {
    throw new AuthError("forbidden", "Only the Managing Partner can reverse a paid requisition.");
  }
  if (!reason.trim()) throw new AuthError("validation", "A reason is required.");
  return runInTransaction(async () => {
    await lockFinanceKey(`requisition:${firmId}:${id}`);
    const existing = await getRequisition(firmId, id);
    if (!existing) throw new AuthError("not_found", "Requisition not found.");
    if (existing.status !== "paid") {
      throw new AuthError("validation", "Only paid requisitions can be reversed.");
    }
    const db = getDb();
    const linked = await db
      .select()
      .from(disbursements)
      .where(and(eq(disbursements.firmId, firmId), eq(disbursements.requisitionId, id)));
    if (linked.some((d) => d.invoiceId)) {
      throw new AuthError(
        "validation",
        "This disbursement has already been billed. Reverse or credit the invoice first.",
      );
    }

    if (existing.trustEntryId) {
      await reverseTrustEntry(
        firmId,
        { id: userId, isManagingPartner: true },
        existing.trustEntryId,
        reason,
        { fromSource: true },
      );
    }
    for (const d of linked) {
      if (d.billable) {
        await reverseJournalBySource(firmId, userId, "expense", `disb-${d.id}`, `Requisition reversal: ${reason.trim()}`);
      }
      await db
        .update(disbursements)
        .set({ billable: false, description: `${d.description} [reversed: ${reason.trim()}]`.slice(0, 500) })
        .where(eq(disbursements.id, d.id));
    }
    if (existing.expenseId) {
      await reverseFirmExpense(firmId, userId, existing.expenseId, reason);
    }

    await db
      .update(financeRequisitions)
      .set({
        status: "reversed",
        recoverable: false,
        reversedAt: new Date(),
        reversedBy: userId,
        reversalReason: reason.trim(),
        updatedAt: new Date(),
      })
      .where(and(eq(financeRequisitions.firmId, firmId), eq(financeRequisitions.id, id)));
    return getRequisition(firmId, id);
  });
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

/**
 * Mark a paid recoverable requisition as settled once the client has paid the invoice that
 * billed the advance. The recovered amount moves from the receiving account back into the float.
 */
export async function settleRecoverableRequisition(
  firmId: string,
  userId: string,
  id: string,
  opts?: { receivedInto?: "1010" | "1020" },
) {
  const existing = await runInTransaction(async () => {
    await lockFinanceKey(`requisition:${firmId}:${id}`);
    const row = await getRequisition(firmId, id);
    if (!row) throw new AuthError("not_found", "Requisition not found.");
    if (row.status !== "paid" || !row.recoverable) {
      throw new AuthError(
        "validation",
        "Only paid recoverable disbursement requisitions can be settled.",
      );
    }
    const db = getDb();
    const floatDisbs = await db
      .select({
        id: disbursements.id,
        amountCents: disbursements.amountCents,
        invoiceId: disbursements.invoiceId,
        invoiceStatus: invoices.status,
      })
      .from(disbursements)
      .leftJoin(invoices, eq(invoices.id, disbursements.invoiceId))
      .where(
        and(
          eq(disbursements.firmId, firmId),
          eq(disbursements.requisitionId, id),
          eq(disbursements.paidFrom, "firm_float"),
          eq(disbursements.billable, true),
        ),
      );
    if (floatDisbs.some((d) => !d.invoiceId || d.invoiceStatus !== "paid")) {
      throw new AuthError(
        "validation",
        "Bill the advance to the client and record the payment first. Recovery is taken from the paid invoice.",
      );
    }
    const recovered = floatDisbs.reduce((s, d) => s + d.amountCents, 0);
    await lockFloat(firmId);
    await returnRecoveryToFloat(
      firmId,
      userId,
      id,
      recovered,
      opts?.receivedInto ?? "1010",
      `Advance recovered to float: ${row.description}`.slice(0, 200),
    );
    await db
      .update(financeRequisitions)
      .set({
        recoverable: false,
        paymentRef: row.paymentRef ? `${row.paymentRef} · settled` : "settled",
        updatedAt: new Date(),
      })
      .where(and(eq(financeRequisitions.firmId, firmId), eq(financeRequisitions.id, id)));
    return row;
  });

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
