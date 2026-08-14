import { and, eq, ilike, isNull, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import { clientDisplayLabel } from "@/lib/clients/display";
import { clientTypeLabel } from "@/lib/clients/kyc-types";
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
          ilike(clients.clientNumber, pattern),
          ilike(clients.firstName, pattern),
          ilike(clients.surname, pattern),
          ilike(clients.fullName, pattern),
          ilike(clients.legalName, pattern),
          ilike(clients.registeredName, pattern),
          ilike(clients.tradingName, pattern),
          ilike(clients.idNumber, pattern),
          ilike(clients.nationalIdOrRegNumber, pattern),
          ilike(clients.phone, pattern),
          ilike(clients.whatsapp, pattern),
          ilike(clients.email, pattern),
        )!,
      ),
    )
    .limit(limit);

  return rows.map((row) => ({
    type: "client" as const,
    id: row.id,
    title: clientDisplayLabel(row),
    subtitle: [
      clientTypeLabel(row.clientType),
      row.idNumber ?? row.nationalIdOrRegNumber,
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
