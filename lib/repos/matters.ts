/**
 * Matter repository (P1-01 stubs + P1-03 CRUD).
 * EVERY query MUST filter by firmId. Apply view_all vs assigned scoping at call site.
 */
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  or,
  sql,
} from "drizzle-orm";
import { getDb } from "@/lib/db";
import { clients, matterTeam, matters, users } from "@/lib/db/schema";
import { latestTrackingByMatter } from "@/lib/repos/matter-tracking";
import { clientDisplayLabel } from "@/lib/clients/display";
import type { MatterInput } from "@/lib/matters/validation";
import {
  CLOSED_MATTER_STATUSES,
  OPEN_MATTER_STATUSES,
} from "@/lib/matters/validation";
import type { MatterStatus } from "@/lib/db/mvp-types";
import { syncMatterHearingEvent } from "@/lib/repos/calendar";
import { allocateMatterNumber } from "@/lib/repos/firm-settings";

export type ListMattersOpts = {
  q?: string;
  status?: MatterStatus | string;
  /** open = prospective|open|on_hold; closed = closed|archived */
  bucket?: "open" | "closed" | "all";
  areaOfLaw?: string;
  clientId?: string;
  responsibleLawyerId?: string;
  /** When false, restrict to responsible lawyer OR matter_team membership. */
  viewAll?: boolean;
  userId?: string;
  sort?: "updated" | "title" | "nextHearing" | "created";
  sortDir?: "asc" | "desc";
};

export type MatterListRow = typeof matters.$inferSelect & {
  clientDisplayName: string;
  responsibleLawyerName: string | null;
  trackingSummary: string | null;
  trackingOn: string | null;
};

function valuesFromInput(input: MatterInput) {
  return {
    clientId: input.clientId,
    title: input.title,
    description: input.description ?? null,
    areaOfLaw: input.areaOfLaw,
    matterNumber: input.matterNumber ?? null,
    fileRef: input.fileRef ?? null,
    courtName: input.courtName ?? null,
    caseNumber: input.caseNumber ?? null,
    responsibleLawyerId: input.responsibleLawyerId ?? null,
    nextHearingAt: input.nextHearingAt ? new Date(input.nextHearingAt) : null,
    priority: input.priority ?? "normal",
  };
}

function timestampsForStatus(
  status: MatterStatus,
  existing?: { openedAt: Date | null; closedAt: Date | null },
) {
  const now = new Date();
  if (status === "open" || status === "on_hold") {
    return {
      openedAt: existing?.openedAt ?? now,
      closedAt: null as Date | null,
    };
  }
  if (status === "closed" || status === "archived") {
    return {
      openedAt: existing?.openedAt ?? null,
      closedAt: existing?.closedAt ?? now,
    };
  }
  return {
    openedAt: existing?.openedAt ?? null,
    closedAt: null as Date | null,
  };
}

export async function listMatters(firmId: string, opts?: ListMattersOpts): Promise<MatterListRow[]> {
  const db = getDb();
  const conditions = [eq(matters.firmId, firmId)];

  if (opts?.status) {
    conditions.push(eq(matters.status, opts.status));
  } else if (opts?.bucket === "open") {
    conditions.push(inArray(matters.status, [...OPEN_MATTER_STATUSES]));
  } else if (opts?.bucket === "closed") {
    conditions.push(inArray(matters.status, [...CLOSED_MATTER_STATUSES]));
  }

  if (opts?.areaOfLaw) conditions.push(eq(matters.areaOfLaw, opts.areaOfLaw));
  if (opts?.clientId) conditions.push(eq(matters.clientId, opts.clientId));
  if (opts?.responsibleLawyerId) {
    conditions.push(eq(matters.responsibleLawyerId, opts.responsibleLawyerId));
  }

  if (opts?.q?.trim()) {
    const pattern = `%${opts.q.trim()}%`;
    conditions.push(
      or(
        ilike(matters.title, pattern),
        ilike(matters.matterNumber, pattern),
        ilike(matters.caseNumber, pattern),
        ilike(matters.fileRef, pattern),
        ilike(clients.fullName, pattern),
        ilike(clients.legalName, pattern),
        ilike(clients.tradingName, pattern),
      )!,
    );
  }

  if (opts?.viewAll === false) {
    if (!opts.userId) {
      return [];
    }
    const teamMatterIds = db
      .select({ matterId: matterTeam.matterId })
      .from(matterTeam)
      .where(and(eq(matterTeam.firmId, firmId), eq(matterTeam.userId, opts.userId)));

    conditions.push(
      or(eq(matters.responsibleLawyerId, opts.userId), inArray(matters.id, teamMatterIds))!,
    );
  }

  const sortKey = opts?.sort ?? "updated";
  const sortDir = opts?.sortDir ?? "desc";
  const orderFn = sortDir === "asc" ? asc : desc;
  const orderCol =
    sortKey === "title"
      ? matters.title
      : sortKey === "nextHearing"
        ? matters.nextHearingAt
        : sortKey === "created"
          ? matters.createdAt
          : matters.updatedAt;

  const rows = await db
    .select({
      matter: matters,
      clientFullName: clients.fullName,
      clientFirstName: clients.firstName,
      clientSurname: clients.surname,
      clientLegalName: clients.legalName,
      clientRegisteredName: clients.registeredName,
      clientTradingName: clients.tradingName,
      clientNumber: clients.clientNumber,
      clientType: clients.clientType,
      lawyerName: users.fullName,
    })
    .from(matters)
    .innerJoin(clients, and(eq(clients.id, matters.clientId), eq(clients.firmId, firmId)))
    .leftJoin(users, eq(users.id, matters.responsibleLawyerId))
    .where(and(...conditions))
    .orderBy(orderFn(orderCol));

  const listed = rows.map((row) => ({
    ...row.matter,
    clientDisplayName: clientDisplayLabel({
      clientNumber: row.clientNumber,
      clientType: row.clientType,
      fullName: row.clientFullName,
      firstName: row.clientFirstName,
      surname: row.clientSurname,
      legalName: row.clientLegalName,
      registeredName: row.clientRegisteredName,
      tradingName: row.clientTradingName,
    }),
    responsibleLawyerName: row.lawyerName ?? null,
  }));
  const tracking = await latestTrackingByMatter(
    firmId,
    listed.map((row) => row.id),
  );
  return listed.map((row) => {
    const current = tracking.get(row.id);
    return {
      ...row,
      trackingSummary: current?.summary ?? null,
      trackingOn: current?.happensOn ?? null,
    };
  });
}

export async function getMatterById(firmId: string, matterId: string) {
  const db = getDb();
  const rows = await db
    .select({
      matter: matters,
      clientFullName: clients.fullName,
      clientFirstName: clients.firstName,
      clientSurname: clients.surname,
      clientLegalName: clients.legalName,
      clientRegisteredName: clients.registeredName,
      clientTradingName: clients.tradingName,
      clientNumber: clients.clientNumber,
      clientType: clients.clientType,
      lawyerName: users.fullName,
    })
    .from(matters)
    .innerJoin(clients, and(eq(clients.id, matters.clientId), eq(clients.firmId, firmId)))
    .leftJoin(users, eq(users.id, matters.responsibleLawyerId))
    .where(and(eq(matters.firmId, firmId), eq(matters.id, matterId)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    ...row.matter,
    clientDisplayName: clientDisplayLabel({
      clientNumber: row.clientNumber,
      clientType: row.clientType,
      fullName: row.clientFullName,
      firstName: row.clientFirstName,
      surname: row.clientSurname,
      legalName: row.clientLegalName,
      registeredName: row.clientRegisteredName,
      tradingName: row.clientTradingName,
    }),
    responsibleLawyerName: row.lawyerName ?? null,
  };
}

export async function userCanAccessMatter(
  firmId: string,
  matterId: string,
  userId: string,
  viewAll: boolean,
): Promise<boolean> {
  if (viewAll) {
    const row = await getMatterById(firmId, matterId);
    return Boolean(row);
  }

  const db = getDb();
  const matter = await getMatterById(firmId, matterId);
  if (!matter) return false;
  if (matter.responsibleLawyerId === userId) return true;

  const team = await db
    .select({ userId: matterTeam.userId })
    .from(matterTeam)
    .where(
      and(
        eq(matterTeam.firmId, firmId),
        eq(matterTeam.matterId, matterId),
        eq(matterTeam.userId, userId),
      ),
    )
    .limit(1);

  return team.length > 0;
}

/** Matter IDs the user can access when !viewAll (responsible or team). */
export async function listAccessibleMatterIds(
  firmId: string,
  userId: string,
): Promise<string[]> {
  const db = getDb();
  const responsible = await db
    .select({ id: matters.id })
    .from(matters)
    .where(
      and(eq(matters.firmId, firmId), eq(matters.responsibleLawyerId, userId)),
    );
  const team = await db
    .select({ matterId: matterTeam.matterId })
    .from(matterTeam)
    .where(and(eq(matterTeam.firmId, firmId), eq(matterTeam.userId, userId)));
  return [
    ...new Set([
      ...responsible.map((r) => r.id),
      ...team.map((t) => t.matterId),
    ]),
  ];
}

export async function createMatter(firmId: string, userId: string, input: MatterInput) {
  const db = getDb();
  const status: MatterStatus = input.status ?? "prospective";
  const stamps = timestampsForStatus(status);
  const matterNumber =
    input.matterNumber?.trim() || (await allocateMatterNumber(firmId));

  const rows = await db
    .insert(matters)
    .values({
      firmId,
      createdBy: userId,
      status,
      ...valuesFromInput(input),
      matterNumber,
      ...stamps,
    })
    .returning();

  const matter = rows[0];
  if (matter.responsibleLawyerId) {
    await db
      .insert(matterTeam)
      .values({
        firmId,
        matterId: matter.id,
        userId: matter.responsibleLawyerId,
        roleOnMatter: "responsible_lawyer",
      })
      .onConflictDoNothing();
  }

  await syncMatterHearingEvent({
    firmId,
    userId,
    matterId: matter.id,
    matterTitle: matter.title,
    courtName: matter.courtName,
    nextHearingAt: matter.nextHearingAt,
  });

  return matter;
}

export async function updateMatter(
  firmId: string,
  matterId: string,
  input: MatterInput,
  actorUserId?: string,
) {
  const db = getDb();
  const existing = await getMatterById(firmId, matterId);
  if (!existing) return null;

  const status = (input.status ?? existing.status) as MatterStatus;
  const stamps = timestampsForStatus(status, {
    openedAt: existing.openedAt,
    closedAt: existing.closedAt,
  });

  const matterNumber =
    input.matterNumber?.trim() ||
    existing.matterNumber ||
    (await allocateMatterNumber(firmId));

  const patch: Record<string, unknown> = {
    title: input.title,
    description: input.description ?? null,
    areaOfLaw: input.areaOfLaw,
    matterNumber,
    fileRef: input.fileRef ?? null,
    courtName: input.courtName ?? null,
    caseNumber: input.caseNumber ?? null,
    responsibleLawyerId: input.responsibleLawyerId ?? null,
    nextHearingAt: input.nextHearingAt ? new Date(input.nextHearingAt) : null,
    priority: input.priority ?? "normal",
    status,
    updatedAt: new Date(),
    ...stamps,
  };

  if (input.clientId) {
    patch.clientId = input.clientId;
  }

  const rows = await db
    .update(matters)
    .set(patch)
    .where(and(eq(matters.firmId, firmId), eq(matters.id, matterId)))
    .returning();

  const matter = rows[0] ?? null;
  if (matter?.responsibleLawyerId) {
    await db
      .insert(matterTeam)
      .values({
        firmId,
        matterId: matter.id,
        userId: matter.responsibleLawyerId,
        roleOnMatter: "responsible_lawyer",
      })
      .onConflictDoNothing();
  }

  if (matter) {
    await syncMatterHearingEvent({
      firmId,
      userId: actorUserId ?? matter.createdBy,
      matterId: matter.id,
      matterTitle: matter.title,
      courtName: matter.courtName,
      nextHearingAt: matter.nextHearingAt,
    });
  }

  return matter;
}

export async function updateMatterStatus(
  firmId: string,
  matterId: string,
  status: MatterStatus,
) {
  const existing = await getMatterById(firmId, matterId);
  if (!existing) return null;

  const stamps = timestampsForStatus(status, {
    openedAt: existing.openedAt,
    closedAt: existing.closedAt,
  });

  const db = getDb();
  const rows = await db
    .update(matters)
    .set({
      status,
      updatedAt: new Date(),
      ...stamps,
    })
    .where(and(eq(matters.firmId, firmId), eq(matters.id, matterId)))
    .returning();

  return rows[0] ?? null;
}

export async function getMatterCountsForClient(
  firmId: string,
  clientId: string,
  opts?: { viewAll?: boolean; userId?: string },
) {
  const db = getDb();
  const conditions = [eq(matters.firmId, firmId), eq(matters.clientId, clientId)];

  if (opts?.viewAll === false) {
    if (!opts.userId) {
      return { open: 0, closed: 0, total: 0 };
    }
    const teamMatterIds = db
      .select({ matterId: matterTeam.matterId })
      .from(matterTeam)
      .where(and(eq(matterTeam.firmId, firmId), eq(matterTeam.userId, opts.userId)));

    conditions.push(
      or(eq(matters.responsibleLawyerId, opts.userId), inArray(matters.id, teamMatterIds))!,
    );
  }

  const rows = await db
    .select({
      status: matters.status,
      count: sql<number>`count(*)::int`,
    })
    .from(matters)
    .where(and(...conditions))
    .groupBy(matters.status);

  let open = 0;
  let closed = 0;
  for (const row of rows) {
    if (OPEN_MATTER_STATUSES.includes(row.status as MatterStatus)) open += row.count;
    else if (CLOSED_MATTER_STATUSES.includes(row.status as MatterStatus)) closed += row.count;
  }
  return { open, closed, total: open + closed };
}

export async function listFirmLawyers(firmId: string) {
  const db = getDb();
  return db
    .select({
      id: users.id,
      fullName: users.fullName,
      email: users.email,
      isSystemUser: users.isSystemUser,
    })
    .from(users)
    .where(
      and(
        eq(users.firmId, firmId),
        eq(users.isActive, true),
        eq(users.isLawyer, true),
      ),
    )
    .orderBy(asc(users.fullName));
}
