import type { clients } from "@/lib/db/schema";
import { clientDisplayLabel, clientDisplayName } from "@/lib/clients/display";
import {
  clientTypeLabel,
  normalizeClientType,
  type KycDocumentsChecklist,
  type UboRow,
} from "@/lib/clients/kyc-types";

type ClientRow = typeof clients.$inferSelect;

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

export function serializeClient(row: ClientRow) {
  return {
    id: row.id,
    firmId: row.firmId,
    clientNumber: row.clientNumber,
    clientType: row.clientType,
    firstName: row.firstName,
    surname: row.surname,
    otherNames: row.otherNames,
    maidenName: row.maidenName,
    dateOfBirth: iso(row.dateOfBirth),
    nationality: row.nationality,
    idNumber: row.idNumber,
    fullName: row.fullName,
    legalName: row.legalName,
    registeredName: row.registeredName,
    tradingName: row.tradingName,
    nationalIdOrRegNumber: row.nationalIdOrRegNumber,
    regTaxNumber: row.regTaxNumber,
    taxNumber: row.taxNumber,
    incorporationDate: iso(row.incorporationDate),
    incorporationCountry: row.incorporationCountry,
    email: row.email,
    phone: row.phone,
    whatsapp: row.whatsapp,
    altPhone: row.altPhone,
    residentialAddress: row.residentialAddress,
    registeredAddress: row.registeredAddress,
    businessAddress: row.businessAddress,
    physicalAddress: row.physicalAddress,
    postalAddress: row.postalAddress,
    occupation: row.occupation,
    employer: row.employer,
    industry: row.industry,
    responsibleLawyerId: row.responsibleLawyerId,
    pepStatus: row.pepStatus,
    pepDetails: row.pepDetails,
    uboJson: (row.uboJson ?? []) as UboRow[],
    matterScopePurpose: row.matterScopePurpose,
    sourceOfFunds: row.sourceOfFunds,
    sourceOfFundsOther: row.sourceOfFundsOther,
    kycDocumentsJson: (row.kycDocumentsJson ?? {}) as KycDocumentsChecklist,
    declarationSignedAt: iso(row.declarationSignedAt),
    declarationSignatory: row.declarationSignatory,
    kycStatus: row.kycStatus,
    kycNotes: row.kycNotes,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    displayName: clientDisplayName(row),
    displayLabel: clientDisplayLabel(row),
  };
}

/** Slim client payload for invoice / quotation pickers (no KYC fields). */
export function serializeClientLite(row: ClientRow) {
  return {
    id: row.id,
    clientNumber: row.clientNumber,
    clientType: row.clientType,
    phone: row.phone,
    email: row.email,
    displayName: clientDisplayName(row),
    displayLabel: clientDisplayLabel(row),
    clientTypeLabel: clientTypeLabel(normalizeClientType(row.clientType)),
  };
}
