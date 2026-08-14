import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { clients } from "@/lib/db/schema";

/** Allocate CL0001, CL0002, … per firm (4-digit zero-padded). */
export async function allocateClientNumber(firmId: string): Promise<string> {
  const db = getDb();
  const rows = await db
    .select({
      maxNum: sql<string | null>`max(cast(substring(${clients.clientNumber} from 3) as integer))`,
    })
    .from(clients)
    .where(sql`${clients.firmId} = ${firmId} AND ${clients.clientNumber} ~ '^CL[0-9]+$'`);

  const currentMax = Number(rows[0]?.maxNum ?? 0);
  const next = currentMax + 1;
  if (next > 9999) {
    throw new Error("Client number sequence exhausted for this firm.");
  }
  return `CL${String(next).padStart(4, "0")}`;
}
