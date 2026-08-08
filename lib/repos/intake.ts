/**
 * Intake repository (P3-01 stubs + P3-09 CRUD + P3-11 conversion).
 * EVERY firm-scoped query MUST filter firmId.
 * Do NOT auto-create clients on save (use convertIntake).
 */
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { AuthError } from "@/lib/auth/types";
import { getDb } from "@/lib/db";
import { conflictChecks, intakes, users } from "@/lib/db/schema";
import {
  assertIntakeEditable,
  normalizeIntakeStatus,
  type IntakeInput,
} from "@/lib/intake/validation";
import type { ConvertIntakeInput } from "@/lib/intake/convert";
import { validateClientInput } from "@/lib/clients/validation";
import { createClient } from "@/lib/repos/clients";
import { createMatter } from "@/lib/repos/matters";
import { createParty } from "@/lib/repos/parties";
import { createMatterEvent } from "@/lib/repos/timeline";
import { conflictCheckAllowsConversion } from "@/lib/conflicts/search";

export async function listIntakes(
  firmId: string,
  opts?: { status?: string; includeArchived?: boolean },
) {
  const db = getDb();
  const conditions = [eq(intakes.firmId, firmId)];

  if (opts?.status === "open") {
    conditions.push(inArray(intakes.status, ["open", "draft", "submitted"]));
  } else if (opts?.status) {
    conditions.push(eq(intakes.status, opts.status));
  } else if (!opts?.includeArchived) {
    conditions.push(ne(intakes.status, "archived"));
  }

  return db
    .select({
      intake: intakes,
      assigneeName: users.fullName,
    })
    .from(intakes)
    .leftJoin(users, eq(users.id, intakes.assignedTo))
    .where(and(...conditions))
    .orderBy(desc(intakes.updatedAt));
}

export async function getIntake(firmId: string, id: string) {
  const db = getDb();
  const rows = await db
    .select({
      intake: intakes,
      assigneeName: users.fullName,
    })
    .from(intakes)
    .leftJoin(users, eq(users.id, intakes.assignedTo))
    .where(and(eq(intakes.firmId, firmId), eq(intakes.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export async function createIntake(
  firmId: string,
  userId: string,
  input: IntakeInput,
) {
  const db = getDb();
  const rows = await db
    .insert(intakes)
    .values({
      firmId,
      status: input.status ?? "open",
      prospectName: input.prospectName,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      areaOfLaw: input.areaOfLaw,
      matterSummary: input.matterSummary,
      opposingParty: input.opposingParty,
      assignedTo: input.assignedTo,
      createdBy: userId,
      updatedAt: new Date(),
    })
    .returning();
  return rows[0]!;
}

export async function updateIntake(firmId: string, id: string, input: IntakeInput) {
  const existing = await getIntake(firmId, id);
  if (!existing) return null;
  assertIntakeEditable(existing.intake.status);

  const nextStatus = input.status ?? existing.intake.status;
  if (normalizeIntakeStatus(nextStatus) === "converted") {
    throw new AuthError(
      "validation",
      "Conversion happens in P3-11. Use declined or archived for now.",
    );
  }

  const db = getDb();
  const rows = await db
    .update(intakes)
    .set({
      prospectName: input.prospectName,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      areaOfLaw: input.areaOfLaw,
      matterSummary: input.matterSummary,
      opposingParty: input.opposingParty,
      assignedTo: input.assignedTo,
      status: nextStatus === "draft" || nextStatus === "submitted" ? "open" : nextStatus,
      updatedAt: new Date(),
    })
    .where(and(eq(intakes.firmId, firmId), eq(intakes.id, id)))
    .returning();
  return rows[0] ?? null;
}

export async function setIntakeStatus(
  firmId: string,
  id: string,
  status: "open" | "declined" | "archived",
) {
  const existing = await getIntake(firmId, id);
  if (!existing) return null;
  if (normalizeIntakeStatus(existing.intake.status) === "converted") {
    throw new AuthError("validation", "Converted intakes cannot change status here.");
  }

  const db = getDb();
  const rows = await db
    .update(intakes)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(intakes.firmId, firmId), eq(intakes.id, id)))
    .returning();
  return rows[0] ?? null;
}

export async function listConflictChecks(firmId: string, intakeId?: string) {
  const db = getDb();
  const conditions = [eq(conflictChecks.firmId, firmId)];
  if (intakeId) conditions.push(eq(conflictChecks.intakeId, intakeId));
  return db
    .select()
    .from(conflictChecks)
    .where(and(...conditions))
    .orderBy(desc(conflictChecks.createdAt));
}

export async function getLatestConflictCheck(firmId: string, intakeId: string) {
  const rows = await listConflictChecks(firmId, intakeId);
  return rows[0] ?? null;
}

export async function createConflictCheck(input: {
  firmId: string;
  intakeId: string;
  userId: string;
  query: string;
  result: "clear" | "conflict" | "possible" | "not_done";
  notes: string | null;
}) {
  const db = getDb();
  const now = new Date();
  const rows = await db
    .insert(conflictChecks)
    .values({
      firmId: input.firmId,
      intakeId: input.intakeId,
      query: input.query,
      result: input.result,
      notes: input.notes,
      checkedBy: input.userId,
      checkedAt: now,
    })
    .returning();
  return rows[0]!;
}

export async function getConflictCheck(firmId: string, checkId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(conflictChecks)
    .where(and(eq(conflictChecks.firmId, firmId), eq(conflictChecks.id, checkId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateConflictCheckNotes(
  firmId: string,
  checkId: string,
  notes: string,
) {
  const db = getDb();
  const rows = await db
    .update(conflictChecks)
    .set({ notes })
    .where(and(eq(conflictChecks.firmId, firmId), eq(conflictChecks.id, checkId)))
    .returning();
  return rows[0] ?? null;
}

/**
 * Convert intake → client + matter (+ optional opposing party).
 * Caller must enforce conflict gate and permissions.
 */
export async function convertIntake(
  firmId: string,
  userId: string,
  intakeId: string,
  input: ConvertIntakeInput,
  latestCheck: { result: string; notes: string | null } | null,
) {
  const full = await getIntake(firmId, intakeId);
  if (!full) return null;

  const statusNorm = normalizeIntakeStatus(full.intake.status);
  if (statusNorm === "converted") {
    throw new AuthError(
      "validation",
      "This intake is already converted. Open the linked matter.",
    );
  }
  if (statusNorm === "declined" || statusNorm === "archived") {
    throw new AuthError(
      "validation",
      "Reopen the intake before converting.",
    );
  }

  const gate = conflictCheckAllowsConversion(latestCheck);
  if (!gate.allowed) {
    throw new AuthError("validation", gate.reason);
  }

  validateClientInput({
    clientType: input.clientType,
    fullName: input.fullName,
    legalName: input.legalName,
    email: full.intake.contactEmail,
    phone: full.intake.contactPhone,
  });

  const client = await createClient(firmId, userId, {
    clientType: input.clientType,
    fullName: input.fullName,
    legalName: input.legalName,
    email: full.intake.contactEmail,
    phone: full.intake.contactPhone,
    kycNotes: `Converted from intake ${intakeId}.`,
  });

  const matter = await createMatter(firmId, userId, {
    clientId: client.id,
    title: input.title,
    description: input.matterDescription ?? full.intake.matterSummary,
    areaOfLaw: input.areaOfLaw,
    status: input.matterStatus,
    responsibleLawyerId:
      input.responsibleLawyerId ?? full.intake.assignedTo ?? null,
    conflictCheckStatus: input.conflictCheckStatus,
    priority: "normal",
  });

  let opposingPartyId: string | null = null;
  const opposingName = input.opposingPartyName ?? full.intake.opposingParty;
  if (opposingName?.trim()) {
    const party = await createParty(firmId, {
      partyRole: "opposing_party",
      name: opposingName.trim(),
      matterId: matter.id,
      clientId: client.id,
      notes: "Created from intake conversion.",
    });
    opposingPartyId = party.id;
  }

  await createMatterEvent({
    firmId,
    matterId: matter.id,
    eventType: "system",
    title: "Converted from intake",
    body: [
      `Intake: ${full.intake.prospectName} (${intakeId}).`,
      `Conflict result: ${latestCheck?.result ?? "n/a"}.`,
      opposingPartyId ? `Opposing party recorded.` : null,
    ]
      .filter(Boolean)
      .join(" "),
    createdBy: userId,
  });

  const db = getDb();
  const rows = await db
    .update(intakes)
    .set({
      status: "converted",
      convertedClientId: client.id,
      convertedMatterId: matter.id,
      updatedAt: new Date(),
    })
    .where(and(eq(intakes.firmId, firmId), eq(intakes.id, intakeId)))
    .returning();

  const intake = rows[0];
  if (!intake) {
    throw new AuthError("server", "Failed to mark intake converted.");
  }

  return {
    intake,
    client,
    matter,
    opposingPartyId,
  };
}
