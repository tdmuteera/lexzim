import "server-only";

import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { AuthError } from "@/lib/auth/types";
import { clientDisplayName } from "@/lib/clients/display";
import { getDb } from "@/lib/db";
import {
  clients,
  matters,
  myDayItems,
  myDayPrefs,
  myDayRecurrences,
} from "@/lib/db/schema";
import {
  addDays,
  isIsoDate,
  recurrenceMatches,
  type MyDayItemDto,
  type MyDayPayload,
  type MyDayRecurrenceDto,
  type MyDayRule,
  type MyDayStatus,
} from "@/lib/my-day/shared";

const PLAN_HORIZON_DAYS = 14;

type ItemRow = typeof myDayItems.$inferSelect;

export type MyDayItemInput = {
  title: string;
  notes: string | null;
  dueDate: string | null;
  dueTime: string | null;
  tag: string | null;
  starred: boolean;
  clientId: string | null;
  matterId: string | null;
};

export type MyDayRecurrenceInput = {
  rule: MyDayRule;
  weekday: number | null;
  monthDay: number | null;
};

async function assertLinks(firmId: string, clientId: string | null, matterId: string | null) {
  const db = getDb();
  if (clientId) {
    const [c] = await db
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.firmId, firmId), eq(clients.id, clientId)))
      .limit(1);
    if (!c) throw new AuthError("not_found", "Client not found.");
  }
  if (matterId) {
    const [m] = await db
      .select({ id: matters.id })
      .from(matters)
      .where(and(eq(matters.firmId, firmId), eq(matters.id, matterId)))
      .limit(1);
    if (!m) throw new AuthError("not_found", "Matter not found.");
  }
}

function ownerScope(firmId: string, userId: string) {
  return and(eq(myDayItems.firmId, firmId), eq(myDayItems.userId, userId));
}

async function generateRecurrences(firmId: string, userId: string, today: string) {
  const db = getDb();
  const horizon = addDays(today, PLAN_HORIZON_DAYS);
  const recs = await db
    .select()
    .from(myDayRecurrences)
    .where(and(eq(myDayRecurrences.firmId, firmId), eq(myDayRecurrences.userId, userId)));

  for (const r of recs) {
    let from = r.startsOn > today ? r.startsOn : today;
    if (r.lastGeneratedOn && addDays(r.lastGeneratedOn, 1) > from) {
      from = addDays(r.lastGeneratedOn, 1);
    }
    if (from > horizon) continue;

    const values: (typeof myDayItems.$inferInsert)[] = [];
    for (let d = from; d <= horizon; d = addDays(d, 1)) {
      if (!recurrenceMatches(r.rule, d, r.weekday, r.monthDay)) continue;
      values.push({
        firmId,
        userId,
        title: r.title,
        notes: r.notes,
        dueDate: d,
        originalDate: d,
        dueTime: r.dueTime,
        tag: r.tag,
        starred: r.starred,
        clientId: r.clientId,
        matterId: r.matterId,
        recurrenceId: r.id,
      });
    }
    if (values.length) {
      await db.insert(myDayItems).values(values).onConflictDoNothing();
    }
    await db
      .update(myDayRecurrences)
      .set({ lastGeneratedOn: horizon })
      .where(eq(myDayRecurrences.id, r.id));
  }
}

/**
 * Lazy daily roll-over (no scheduler needed): every unfinished item moves to today.
 * A repeating item carries over once: if today already has its occurrence, older missed
 * copies merge into it; otherwise the latest missed copy moves to today.
 */
async function rollOver(firmId: string, userId: string, today: string) {
  const db = getDb();
  await db
    .update(myDayItems)
    .set({
      dueDate: today,
      carriedCount: sql`${myDayItems.carriedCount} + 1`,
      lastCarriedOn: today,
      updatedAt: new Date(),
    })
    .where(
      and(
        ownerScope(firmId, userId),
        eq(myDayItems.status, "open"),
        isNull(myDayItems.recurrenceId),
        lt(myDayItems.dueDate, today),
      ),
    );

  const missed = await db
    .select({ id: myDayItems.id, recurrenceId: myDayItems.recurrenceId, dueDate: myDayItems.dueDate })
    .from(myDayItems)
    .where(
      and(
        ownerScope(firmId, userId),
        eq(myDayItems.status, "open"),
        sql`${myDayItems.recurrenceId} IS NOT NULL`,
        lt(myDayItems.dueDate, today),
      ),
    )
    .orderBy(desc(myDayItems.dueDate));
  if (!missed.length) return;

  const recIds = [...new Set(missed.map((m) => m.recurrenceId!))];
  const todays = await db
    .select({ id: myDayItems.id, recurrenceId: myDayItems.recurrenceId })
    .from(myDayItems)
    .where(
      and(
        ownerScope(firmId, userId),
        eq(myDayItems.status, "open"),
        eq(myDayItems.dueDate, today),
        inArray(myDayItems.recurrenceId, recIds),
      ),
    );
  const todayByRec = new Map(todays.map((t) => [t.recurrenceId!, t.id]));

  const carryIds: string[] = [];
  const mergeIds: string[] = [];
  const seen = new Set<string>();
  for (const m of missed) {
    const rec = m.recurrenceId!;
    if (seen.has(rec)) {
      mergeIds.push(m.id);
      continue;
    }
    seen.add(rec);
    const existing = todayByRec.get(rec);
    if (existing) {
      mergeIds.push(m.id);
      carryIds.push(existing);
    } else {
      carryIds.push(m.id);
    }
  }

  if (mergeIds.length) {
    await db
      .update(myDayItems)
      .set({ status: "dropped", lastCarriedOn: today, updatedAt: new Date() })
      .where(and(ownerScope(firmId, userId), inArray(myDayItems.id, mergeIds)));
  }
  if (carryIds.length) {
    await db
      .update(myDayItems)
      .set({
        dueDate: today,
        carriedCount: sql`${myDayItems.carriedCount} + 1`,
        lastCarriedOn: today,
        updatedAt: new Date(),
      })
      .where(and(ownerScope(firmId, userId), inArray(myDayItems.id, carryIds)));
  }
}

async function getPrefs(firmId: string, userId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(myDayPrefs)
    .where(and(eq(myDayPrefs.firmId, firmId), eq(myDayPrefs.userId, userId)))
    .limit(1);
  return row ?? null;
}

async function upsertPrefs(
  firmId: string,
  userId: string,
  patch: { lastReviewOn?: string; lastSyncOn?: string },
) {
  const db = getDb();
  await db
    .insert(myDayPrefs)
    .values({ firmId, userId, ...patch, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [myDayPrefs.firmId, myDayPrefs.userId],
      set: { ...patch, updatedAt: new Date() },
    });
}

export async function syncMyDay(firmId: string, userId: string, today: string) {
  const prefs = await getPrefs(firmId, userId);
  if (prefs?.lastSyncOn === today) return prefs;
  await generateRecurrences(firmId, userId, today);
  await rollOver(firmId, userId, today);
  await upsertPrefs(firmId, userId, { lastSyncOn: today });
  return prefs;
}

async function hydrate(rows: ItemRow[]): Promise<MyDayItemDto[]> {
  if (!rows.length) return [];
  const db = getDb();
  const clientIds = [...new Set(rows.map((r) => r.clientId).filter(Boolean))] as string[];
  const matterIds = [...new Set(rows.map((r) => r.matterId).filter(Boolean))] as string[];

  const [cs, ms] = await Promise.all([
    clientIds.length
      ? db
      .select({
        id: clients.id,
        clientType: clients.clientType,
        fullName: clients.fullName,
        firstName: clients.firstName,
        surname: clients.surname,
        legalName: clients.legalName,
        registeredName: clients.registeredName,
        tradingName: clients.tradingName,
      })
      .from(clients)
      .where(inArray(clients.id, clientIds))
      : Promise.resolve([]),
    matterIds.length
      ? db
          .select({ id: matters.id, title: matters.title, matterNumber: matters.matterNumber })
          .from(matters)
          .where(inArray(matters.id, matterIds))
      : Promise.resolve([]),
  ]);

  const clientLabels = new Map<string, string>();
  for (const c of cs) clientLabels.set(c.id, clientDisplayName(c));
  const matterLabels = new Map<string, string>();
  for (const m of ms) {
    matterLabels.set(m.id, m.matterNumber ? `${m.matterNumber} · ${m.title}` : m.title);
  }

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    notes: r.notes,
    dueDate: r.dueDate,
    dueTime: r.dueTime,
    originalDate: r.originalDate,
    tag: r.tag,
    starred: r.starred,
    status: r.status as MyDayStatus,
    carriedCount: r.carriedCount,
    completedOn: r.completedOn,
    clientId: r.clientId,
    clientLabel: r.clientId ? (clientLabels.get(r.clientId) ?? null) : null,
    matterId: r.matterId,
    matterLabel: r.matterId ? (matterLabels.get(r.matterId) ?? null) : null,
    calendarEventId: r.calendarEventId,
    recurrenceId: r.recurrenceId,
    sortOrder: r.sortOrder,
  }));
}

async function computeStreak(firmId: string, userId: string, today: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .selectDistinct({ day: myDayItems.completedOn })
    .from(myDayItems)
    .where(
      and(
        ownerScope(firmId, userId),
        eq(myDayItems.status, "done"),
        gte(myDayItems.completedOn, addDays(today, -120)),
      ),
    );
  const days = new Set(rows.map((r) => r.day).filter(Boolean) as string[]);
  let cursor = days.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export async function getMyDayPayload(
  firmId: string,
  userId: string,
  today: string,
): Promise<MyDayPayload> {
  await syncMyDay(firmId, userId, today);
  const db = getDb();

  const rowsQuery = db
    .select()
    .from(myDayItems)
    .where(
      and(
        ownerScope(firmId, userId),
        or(
          eq(myDayItems.status, "open"),
          and(ne(myDayItems.status, "open"), eq(myDayItems.completedOn, today)),
        ),
      ),
    )
    .orderBy(
      asc(myDayItems.dueDate),
      desc(myDayItems.starred),
      sql`${myDayItems.dueTime} ASC NULLS LAST`,
      asc(myDayItems.sortOrder),
      asc(myDayItems.createdAt),
    )
    .limit(500);

  const recQuery = db
    .select()
    .from(myDayRecurrences)
    .where(and(eq(myDayRecurrences.firmId, firmId), eq(myDayRecurrences.userId, userId)))
    .orderBy(asc(myDayRecurrences.createdAt));

  const [rows, recRows, streak] = await Promise.all([
    rowsQuery,
    recQuery,
    computeStreak(firmId, userId, today),
  ]);

  const items = await hydrate(rows);

  return {
    today,
    items,
    recurrences: recRows.map(
      (r): MyDayRecurrenceDto => ({
        id: r.id,
        title: r.title,
        rule: r.rule as MyDayRule,
        weekday: r.weekday,
        monthDay: r.monthDay,
        tag: r.tag,
        dueTime: r.dueTime,
      }),
    ),
    streak,
  };
}

export async function createMyDayItem(
  firmId: string,
  userId: string,
  input: MyDayItemInput,
  recurrence: MyDayRecurrenceInput | null,
  today: string,
) {
  await assertLinks(firmId, input.clientId, input.matterId);
  const db = getDb();

  if (recurrence) {
    const startsOn = input.dueDate && input.dueDate > today ? input.dueDate : today;
    const [rec] = await db
      .insert(myDayRecurrences)
      .values({
        firmId,
        userId,
        title: input.title,
        notes: input.notes,
        tag: input.tag,
        dueTime: input.dueTime,
        starred: input.starred,
        rule: recurrence.rule,
        weekday: recurrence.weekday,
        monthDay: recurrence.monthDay,
        startsOn,
        clientId: input.clientId,
        matterId: input.matterId,
      })
      .returning();
    if (!rec) throw new AuthError("server", "Could not create repeating item.");
    await generateRecurrences(firmId, userId, today);
    return { recurrenceId: rec.id, item: null };
  }

  const [row] = await db
    .insert(myDayItems)
    .values({
      firmId,
      userId,
      title: input.title,
      notes: input.notes,
      dueDate: input.dueDate,
      originalDate: input.dueDate,
      dueTime: input.dueTime,
      tag: input.tag,
      starred: input.starred,
      clientId: input.clientId,
      matterId: input.matterId,
      sortOrder: Math.floor(Date.now() / 1000),
    })
    .returning();
  if (!row) throw new AuthError("server", "Could not add item.");
  const [dto] = await hydrate([row]);
  return { itemId: row.id, item: dto };
}

export async function getMyDayItem(firmId: string, userId: string, id: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(myDayItems)
    .where(and(ownerScope(firmId, userId), eq(myDayItems.id, id)))
    .limit(1);
  return row ?? null;
}

export async function getMyDayItemDto(firmId: string, userId: string, id: string) {
  const row = await getMyDayItem(firmId, userId, id);
  if (!row) return null;
  const [dto] = await hydrate([row]);
  return dto ?? null;
}

async function patchItem(firmId: string, userId: string, id: string, set: Partial<ItemRow>) {
  const db = getDb();
  const [row] = await db
    .update(myDayItems)
    .set({ ...set, updatedAt: new Date() })
    .where(and(ownerScope(firmId, userId), eq(myDayItems.id, id)))
    .returning();
  if (!row) throw new AuthError("not_found", "Item not found.");
  return row;
}

export async function setMyDayItemStatus(
  firmId: string,
  userId: string,
  id: string,
  status: "open" | "done" | "dropped",
  today: string,
) {
  if (status === "open") {
    return patchItem(firmId, userId, id, {
      status: "open",
      completedOn: null,
      completedAt: null,
    });
  }
  return patchItem(firmId, userId, id, {
    status,
    completedOn: today,
    completedAt: new Date(),
  });
}

export async function moveMyDayItem(
  firmId: string,
  userId: string,
  id: string,
  dueDate: string | null,
) {
  const existing = await getMyDayItem(firmId, userId, id);
  if (!existing) throw new AuthError("not_found", "Item not found.");
  return patchItem(firmId, userId, id, {
    dueDate,
    originalDate: existing.originalDate ?? dueDate,
    status: "open",
    completedOn: null,
    completedAt: null,
  });
}

export async function updateMyDayItem(
  firmId: string,
  userId: string,
  id: string,
  input: Partial<MyDayItemInput>,
) {
  if (input.clientId !== undefined || input.matterId !== undefined) {
    await assertLinks(firmId, input.clientId ?? null, input.matterId ?? null);
  }
  const set: Partial<ItemRow> = {};
  if (input.title !== undefined) set.title = input.title;
  if (input.notes !== undefined) set.notes = input.notes;
  if (input.dueTime !== undefined) set.dueTime = input.dueTime;
  if (input.tag !== undefined) set.tag = input.tag;
  if (input.starred !== undefined) set.starred = input.starred;
  if (input.clientId !== undefined) set.clientId = input.clientId;
  if (input.matterId !== undefined) set.matterId = input.matterId;
  if (input.dueDate !== undefined) set.dueDate = input.dueDate;
  return patchItem(firmId, userId, id, set);
}

export async function markMyDayItemMoved(
  firmId: string,
  userId: string,
  id: string,
  calendarEventId: string,
  today: string,
) {
  return patchItem(firmId, userId, id, {
    status: "moved",
    calendarEventId,
    completedOn: today,
    completedAt: new Date(),
  });
}

export async function deleteMyDayItem(firmId: string, userId: string, id: string) {
  const db = getDb();
  const [row] = await db
    .delete(myDayItems)
    .where(and(ownerScope(firmId, userId), eq(myDayItems.id, id)))
    .returning({ id: myDayItems.id });
  if (!row) throw new AuthError("not_found", "Item not found.");
}

/** Stops a repeating item: removes the series and its not-yet-done future occurrences. */
export async function deleteMyDayRecurrence(
  firmId: string,
  userId: string,
  id: string,
  today: string,
) {
  const db = getDb();
  await db
    .delete(myDayItems)
    .where(
      and(
        ownerScope(firmId, userId),
        eq(myDayItems.recurrenceId, id),
        eq(myDayItems.status, "open"),
        gte(myDayItems.dueDate, today),
      ),
    );
  const [row] = await db
    .delete(myDayRecurrences)
    .where(
      and(
        eq(myDayRecurrences.firmId, firmId),
        eq(myDayRecurrences.userId, userId),
        eq(myDayRecurrences.id, id),
      ),
    )
    .returning({ id: myDayRecurrences.id });
  if (!row) throw new AuthError("not_found", "Repeating item not found.");
}

/** Open items for a date window (calendar strip). */
export async function listMyDayRange(
  firmId: string,
  userId: string,
  from: string,
  to: string,
) {
  const db = getDb();
  const rows = await db
    .select()
    .from(myDayItems)
    .where(
      and(
        ownerScope(firmId, userId),
        gte(myDayItems.dueDate, from),
        lte(myDayItems.dueDate, to),
      ),
    )
    .orderBy(asc(myDayItems.dueDate), sql`${myDayItems.dueTime} ASC NULLS LAST`);
  return hydrate(rows);
}

export function assertIsoDate(value: unknown, label: string): string {
  if (!isIsoDate(value)) throw new AuthError("validation", `${label} must be a YYYY-MM-DD date.`);
  return value;
}
