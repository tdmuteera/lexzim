import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { matterTrackingEntries, users } from "@/lib/db/schema";
import type { TrackingInput } from "@/lib/matters/tracking";

export type TrackingRow = {
  id: string;
  matterId: string;
  summary: string;
  happensOn: string;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: Date;
};

export async function listTrackingForMatter(
  firmId: string,
  matterId: string,
): Promise<TrackingRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: matterTrackingEntries.id,
      matterId: matterTrackingEntries.matterId,
      summary: matterTrackingEntries.summary,
      happensOn: matterTrackingEntries.happensOn,
      createdBy: matterTrackingEntries.createdBy,
      createdByName: users.fullName,
      createdAt: matterTrackingEntries.createdAt,
    })
    .from(matterTrackingEntries)
    .leftJoin(users, eq(users.id, matterTrackingEntries.createdBy))
    .where(
      and(
        eq(matterTrackingEntries.firmId, firmId),
        eq(matterTrackingEntries.matterId, matterId),
      ),
    )
    .orderBy(desc(matterTrackingEntries.createdAt));
  return rows;
}

export async function createTrackingEntry(
  firmId: string,
  matterId: string,
  userId: string,
  input: TrackingInput,
) {
  const db = getDb();
  const [row] = await db
    .insert(matterTrackingEntries)
    .values({
      firmId,
      matterId,
      summary: input.summary,
      happensOn: input.happensOn,
      createdBy: userId,
    })
    .returning();
  return row;
}

/** Latest tracking line for each matter. */
export async function latestTrackingByMatter(firmId: string, matterIds: string[]) {
  const out = new Map<string, { summary: string; happensOn: string }>();
  if (matterIds.length === 0) return out;
  const db = getDb();
  const rows = await db
    .selectDistinctOn([matterTrackingEntries.matterId], {
      matterId: matterTrackingEntries.matterId,
      summary: matterTrackingEntries.summary,
      happensOn: matterTrackingEntries.happensOn,
    })
    .from(matterTrackingEntries)
    .where(
      and(
        eq(matterTrackingEntries.firmId, firmId),
        inArray(matterTrackingEntries.matterId, matterIds),
      ),
    )
    .orderBy(matterTrackingEntries.matterId, desc(matterTrackingEntries.createdAt));
  for (const row of rows) {
    out.set(row.matterId, { summary: row.summary, happensOn: row.happensOn });
  }
  return out;
}
