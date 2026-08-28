/**
 * Client conflict check workflow (P10-13).
 */
import "server-only";

import { and, desc, eq, ilike, or } from "drizzle-orm";
import { AuthError } from "@/lib/auth/types";
import { clientDisplayName } from "@/lib/clients/display";
import { getRequireClearConflict } from "@/lib/conflict/require-clear";
import {
  normalizeConflictResult,
  type ConflictCheckInput,
  type ConflictResult,
} from "@/lib/conflict/validation";
import { getDb } from "@/lib/db";
import {
  clients,
  conflictChecks,
  matters,
  relatedParties,
  users,
} from "@/lib/db/schema";
import { getClientById } from "@/lib/repos/clients";

export type ConflictCandidateKind = "client" | "matter" | "related_party";

export type ConflictCandidate = {
  kind: ConflictCandidateKind;
  id: string;
  label: string;
  detail: string | null;
  clientId: string | null;
  matterId: string | null;
  partyRole: string | null;
};

export async function searchConflictCandidates(
  firmId: string,
  q: string,
  limit = 25,
): Promise<ConflictCandidate[]> {
  const query = q.trim();
  if (query.length < 2) return [];

  const pattern = `%${query}%`;
  const db = getDb();
  const perKind = Math.max(5, Math.ceil(limit / 3));

  const [clientRows, matterRows, partyRows] = await Promise.all([
    db
      .select({
        id: clients.id,
        clientType: clients.clientType,
        fullName: clients.fullName,
        legalName: clients.legalName,
        tradingName: clients.tradingName,
        registeredName: clients.registeredName,
        firstName: clients.firstName,
        surname: clients.surname,
        clientNumber: clients.clientNumber,
        idNumber: clients.idNumber,
        nationalIdOrRegNumber: clients.nationalIdOrRegNumber,
      })
      .from(clients)
      .where(
        and(
          eq(clients.firmId, firmId),
          or(
            ilike(clients.clientNumber, pattern),
            ilike(clients.firstName, pattern),
            ilike(clients.surname, pattern),
            ilike(clients.fullName, pattern),
            ilike(clients.legalName, pattern),
            ilike(clients.registeredName, pattern),
            ilike(clients.tradingName, pattern),
            ilike(clients.idNumber, pattern),
            ilike(clients.nationalIdOrRegNumber, pattern),
          )!,
        ),
      )
      .limit(perKind),
    db
      .select({
        id: matters.id,
        title: matters.title,
        matterNumber: matters.matterNumber,
        clientId: matters.clientId,
        status: matters.status,
        areaOfLaw: matters.areaOfLaw,
      })
      .from(matters)
      .where(
        and(
          eq(matters.firmId, firmId),
          or(ilike(matters.title, pattern), ilike(matters.matterNumber, pattern))!,
        ),
      )
      .limit(perKind),
    db
      .select({
        id: relatedParties.id,
        name: relatedParties.name,
        partyRole: relatedParties.partyRole,
        contact: relatedParties.contact,
        clientId: relatedParties.clientId,
        matterId: relatedParties.matterId,
        matterTitle: matters.title,
      })
      .from(relatedParties)
      .leftJoin(
        matters,
        and(eq(matters.id, relatedParties.matterId), eq(matters.firmId, firmId)),
      )
      .where(
        and(
          eq(relatedParties.firmId, firmId),
          or(
            ilike(relatedParties.name, pattern),
            ilike(relatedParties.contact, pattern),
            ilike(relatedParties.notes, pattern),
          )!,
        ),
      )
      .limit(perKind),
  ]);

  const out: ConflictCandidate[] = [];

  for (const c of clientRows) {
    out.push({
      kind: "client",
      id: c.id,
      label: clientDisplayName(c),
      detail: [c.clientNumber, c.idNumber ?? c.nationalIdOrRegNumber]
        .filter(Boolean)
        .join(" · ") || null,
      clientId: c.id,
      matterId: null,
      partyRole: null,
    });
  }

  for (const m of matterRows) {
    out.push({
      kind: "matter",
      id: m.id,
      label: m.matterNumber ? `${m.matterNumber} · ${m.title}` : m.title,
      detail: [m.status, m.areaOfLaw].filter(Boolean).join(" · ") || null,
      clientId: m.clientId,
      matterId: m.id,
      partyRole: null,
    });
  }

  for (const p of partyRows) {
    const roleLabel =
      p.partyRole === "opposing_party" ? "Opposing party" : p.partyRole.replace(/_/g, " ");
    out.push({
      kind: "related_party",
      id: p.id,
      label: p.name,
      detail: [roleLabel, p.matterTitle, p.contact].filter(Boolean).join(" · ") || null,
      clientId: p.clientId,
      matterId: p.matterId,
      partyRole: p.partyRole,
    });
  }

  return out.slice(0, limit);
}

export type ConflictCheckRow = {
  id: string;
  firmId: string;
  intakeId: string | null;
  clientId: string | null;
  matterId: string | null;
  query: string;
  result: ConflictResult;
  notes: string | null;
  checkedBy: string | null;
  checkedByName: string | null;
  checkedAt: Date | null;
  createdAt: Date;
};

function mapConflictRow(row: {
  id: string;
  firmId: string;
  intakeId: string | null;
  clientId: string | null;
  matterId: string | null;
  query: string;
  result: string;
  notes: string | null;
  checkedBy: string | null;
  checkedByName: string | null;
  checkedAt: Date | null;
  createdAt: Date;
}): ConflictCheckRow {
  return {
    ...row,
    result: normalizeConflictResult(row.result),
  };
}

export async function listConflictChecksByClient(
  firmId: string,
  clientId: string,
): Promise<ConflictCheckRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: conflictChecks.id,
      firmId: conflictChecks.firmId,
      intakeId: conflictChecks.intakeId,
      clientId: conflictChecks.clientId,
      matterId: conflictChecks.matterId,
      query: conflictChecks.query,
      result: conflictChecks.result,
      notes: conflictChecks.notes,
      checkedBy: conflictChecks.checkedBy,
      checkedByName: users.fullName,
      checkedAt: conflictChecks.checkedAt,
      createdAt: conflictChecks.createdAt,
    })
    .from(conflictChecks)
    .leftJoin(users, eq(users.id, conflictChecks.checkedBy))
    .where(and(eq(conflictChecks.firmId, firmId), eq(conflictChecks.clientId, clientId)))
    .orderBy(desc(conflictChecks.checkedAt), desc(conflictChecks.createdAt));

  return rows.map(mapConflictRow);
}

export async function getLatestConflictCheckForClient(
  firmId: string,
  clientId: string,
): Promise<ConflictCheckRow | null> {
  const rows = await listConflictChecksByClient(firmId, clientId);
  return rows[0] ?? null;
}

export async function createConflictCheck(
  firmId: string,
  checkedByUserId: string,
  input: ConflictCheckInput,
): Promise<ConflictCheckRow> {
  const client = await getClientById(firmId, input.clientId);
  if (!client) {
    throw new AuthError("not_found", "Client not found.");
  }

  const db = getDb();
  const now = new Date();
  const inserted = await db
    .insert(conflictChecks)
    .values({
      firmId,
      clientId: input.clientId,
      matterId: input.matterId ?? null,
      intakeId: input.intakeId ?? null,
      query: input.query,
      result: input.result,
      notes: input.notes ?? null,
      checkedBy: checkedByUserId,
      checkedAt: now,
    })
    .returning();

  const row = inserted[0];

  if (input.matterId) {
    await db
      .update(matters)
      .set({
        conflictCheckStatus: input.result,
        updatedAt: now,
      })
      .where(and(eq(matters.firmId, firmId), eq(matters.id, input.matterId)));
  }

  const listed = await listConflictChecksByClient(firmId, input.clientId);
  return listed.find((r) => r.id === row.id) ?? mapConflictRow({
    ...row,
    checkedByName: null,
  });
}

/**
 * When firm requires a clear conflict check, block opening a matter
 * (status === "open") unless latest client check is clear.
 */
export async function assertClearConflictForOpenMatter(
  firmId: string,
  clientId: string,
  targetStatus: string,
): Promise<void> {
  if (targetStatus !== "open") return;

  const required = await getRequireClearConflict(firmId);
  if (!required) return;

  const latest = await getLatestConflictCheckForClient(firmId, clientId);
  if (!latest || latest.result !== "clear") {
    throw new AuthError(
      "validation",
      "A clear conflict check is required before opening this matter. Record Clear on the client conflict panel first (or set status to Prospective / draft).",
    );
  }
}

export function serializeConflictCheck(row: ConflictCheckRow) {
  return {
    id: row.id,
    clientId: row.clientId,
    matterId: row.matterId,
    intakeId: row.intakeId,
    query: row.query,
    result: row.result,
    notes: row.notes,
    checkedBy: row.checkedBy,
    checkedByName: row.checkedByName,
    checkedAt: row.checkedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
