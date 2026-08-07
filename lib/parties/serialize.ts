import type { relatedParties } from "@/lib/db/schema";
import { partyRoleLabel } from "@/lib/parties/validation";

type PartyRow = typeof relatedParties.$inferSelect;

export function serializeParty(
  row: PartyRow,
  extras?: { matterTitle?: string | null; clientDisplayName?: string | null },
) {
  return {
    id: row.id,
    firmId: row.firmId,
    clientId: row.clientId,
    matterId: row.matterId,
    partyRole: row.partyRole,
    partyRoleLabel: partyRoleLabel(row.partyRole),
    name: row.name,
    contact: row.contact,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    matterTitle: extras?.matterTitle ?? null,
    clientDisplayName: extras?.clientDisplayName ?? null,
  };
}
