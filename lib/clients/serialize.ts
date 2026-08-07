import type { clients } from "@/lib/db/schema";
import { clientDisplayName } from "@/lib/clients/display";

type ClientRow = typeof clients.$inferSelect;

export function serializeClient(row: ClientRow) {
  return {
    id: row.id,
    firmId: row.firmId,
    clientType: row.clientType,
    fullName: row.fullName,
    legalName: row.legalName,
    tradingName: row.tradingName,
    nationalIdOrRegNumber: row.nationalIdOrRegNumber,
    taxNumber: row.taxNumber,
    email: row.email,
    phone: row.phone,
    altPhone: row.altPhone,
    physicalAddress: row.physicalAddress,
    postalAddress: row.postalAddress,
    kycNotes: row.kycNotes,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    displayName: clientDisplayName(row),
  };
}
