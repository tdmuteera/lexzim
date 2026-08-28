/**
 * Debtor collection call log (P10-13).
 * Prevents blind duplicate follow-ups across staff.
 */
import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { AuthError } from "@/lib/auth/types";
import { getDb } from "@/lib/db";
import { debtorCommunications, users } from "@/lib/db/schema";
import { getClientById } from "@/lib/repos/clients";

export const DEBTOR_CHANNELS = ["phone", "email", "in_person"] as const;
export type DebtorChannel = (typeof DEBTOR_CHANNELS)[number];

export function isDebtorChannel(value: unknown): value is DebtorChannel {
  return typeof value === "string" && (DEBTOR_CHANNELS as readonly string[]).includes(value);
}

export type DebtorCommunicationRow = {
  id: string;
  firmId: string;
  clientId: string;
  invoiceId: string | null;
  loggedAt: Date;
  employeeUserId: string;
  employeeName: string | null;
  channel: string;
  outcomeNotes: string;
  nextFollowUpAt: Date | null;
  createdAt: Date;
};

export async function listDebtorCommunicationsByClient(
  firmId: string,
  clientId: string,
): Promise<DebtorCommunicationRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: debtorCommunications.id,
      firmId: debtorCommunications.firmId,
      clientId: debtorCommunications.clientId,
      invoiceId: debtorCommunications.invoiceId,
      loggedAt: debtorCommunications.loggedAt,
      employeeUserId: debtorCommunications.employeeUserId,
      employeeName: users.fullName,
      channel: debtorCommunications.channel,
      outcomeNotes: debtorCommunications.outcomeNotes,
      nextFollowUpAt: debtorCommunications.nextFollowUpAt,
      createdAt: debtorCommunications.createdAt,
    })
    .from(debtorCommunications)
    .leftJoin(users, eq(users.id, debtorCommunications.employeeUserId))
    .where(
      and(
        eq(debtorCommunications.firmId, firmId),
        eq(debtorCommunications.clientId, clientId),
      ),
    )
    .orderBy(desc(debtorCommunications.loggedAt), desc(debtorCommunications.createdAt));

  return rows;
}

export type CreateDebtorCommunicationInput = {
  clientId: string;
  employeeUserId: string;
  channel: DebtorChannel;
  outcomeNotes: string;
  loggedAt?: Date;
  nextFollowUpAt?: Date | null;
  invoiceId?: string | null;
};

export async function createDebtorCommunication(
  firmId: string,
  input: CreateDebtorCommunicationInput,
): Promise<DebtorCommunicationRow> {
  const client = await getClientById(firmId, input.clientId);
  if (!client) {
    throw new AuthError("not_found", "Client not found.");
  }

  const notes = input.outcomeNotes.trim();
  if (!notes) {
    throw new AuthError("validation", "Outcome notes are required.");
  }
  if (!isDebtorChannel(input.channel)) {
    throw new AuthError("validation", "Channel must be phone, email, or in_person.");
  }

  const db = getDb();
  const inserted = await db
    .insert(debtorCommunications)
    .values({
      firmId,
      clientId: input.clientId,
      invoiceId: input.invoiceId ?? null,
      loggedAt: input.loggedAt ?? new Date(),
      employeeUserId: input.employeeUserId,
      channel: input.channel,
      outcomeNotes: notes,
      nextFollowUpAt: input.nextFollowUpAt ?? null,
    })
    .returning();

  const row = inserted[0];
  const withName = await listDebtorCommunicationsByClient(firmId, input.clientId);
  return withName.find((r) => r.id === row.id) ?? {
    ...row,
    employeeName: null,
  };
}

export function serializeDebtorCommunication(row: DebtorCommunicationRow) {
  return {
    id: row.id,
    clientId: row.clientId,
    invoiceId: row.invoiceId,
    loggedAt: row.loggedAt.toISOString(),
    employeeUserId: row.employeeUserId,
    employeeName: row.employeeName,
    channel: row.channel,
    outcomeNotes: row.outcomeNotes,
    nextFollowUpAt: row.nextFollowUpAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
