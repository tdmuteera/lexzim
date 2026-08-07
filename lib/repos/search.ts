/**
 * Global search (P1-11). Firm-scoped ILIKE; callers enforce permissions.
 */
import { and, eq, ilike, isNull, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import { clientDisplayName } from "@/lib/clients/display";
import { listMatters } from "@/lib/repos/matters";

export type SearchHit = {
  type: "client" | "matter";
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

export async function searchClients(
  firmId: string,
  q: string,
  limit = 8,
): Promise<SearchHit[]> {
  const db = getDb();
  const pattern = `%${q.trim()}%`;
  const rows = await db
    .select()
    .from(clients)
    .where(
      and(
        eq(clients.firmId, firmId),
        isNull(clients.archivedAt),
        or(
          ilike(clients.fullName, pattern),
          ilike(clients.legalName, pattern),
          ilike(clients.tradingName, pattern),
          ilike(clients.nationalIdOrRegNumber, pattern),
          ilike(clients.phone, pattern),
          ilike(clients.email, pattern),
        )!,
      ),
    )
    .limit(limit);

  return rows.map((row) => ({
    type: "client" as const,
    id: row.id,
    title: clientDisplayName(row),
    subtitle: [
      row.clientType === "company" ? "Company" : "Individual",
      row.nationalIdOrRegNumber,
      row.phone,
    ]
      .filter(Boolean)
      .join(" · "),
    href: `/clients/${row.id}`,
  }));
}

export async function searchMatters(input: {
  firmId: string;
  userId: string;
  viewAll: boolean;
  q: string;
  limit?: number;
}): Promise<SearchHit[]> {
  const rows = await listMatters(input.firmId, {
    q: input.q,
    bucket: "all",
    viewAll: input.viewAll,
    userId: input.userId,
    sort: "updated",
    sortDir: "desc",
  });

  return rows.slice(0, input.limit ?? 8).map((row) => ({
    type: "matter" as const,
    id: row.id,
    title: row.title,
    subtitle: [
      row.clientDisplayName,
      row.areaOfLaw,
      row.matterNumber || row.caseNumber,
      row.status,
    ]
      .filter(Boolean)
      .join(" · "),
    href: `/matters/${row.id}`,
  }));
}
