import { AuthError } from "@/lib/auth/types";
import type {
  ClientType,
  KycDocumentsChecklist,
  KycStatus,
  SourceOfFunds,
  UboRow,
} from "@/lib/clients/kyc-types";
import {
  CLIENT_TYPES,
  normalizeClientType,
  SOURCE_OF_FUNDS_OPTIONS,
} from "@/lib/clients/kyc-types";
import { clientDisplayName } from "@/lib/clients/display";

export type ClientInput = {
  clientType: ClientType;
  firstName?: string | null;
  surname?: string | null;
  otherNames?: string | null;
  maidenName?: string | null;
  dateOfBirth?: Date | null;
  nationality?: string | null;
  idNumber?: string | null;
  fullName?: string | null;
  legalName?: string | null;
  registeredName?: string | null;
  tradingName?: string | null;
  nationalIdOrRegNumber?: string | null;
  regTaxNumber?: string | null;
  taxNumber?: string | null;
  incorporationDate?: Date | null;
  incorporationCountry?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  altPhone?: string | null;
  residentialAddress?: string | null;
  registeredAddress?: string | null;
  businessAddress?: string | null;
  physicalAddress?: string | null;
  postalAddress?: string | null;
  occupation?: string | null;
  employer?: string | null;
  industry?: string | null;
  responsibleLawyerId?: string | null;
  pepStatus?: boolean;
  pepDetails?: string | null;
  uboJson?: UboRow[];
  matterScopePurpose?: string | null;
  sourceOfFunds?: SourceOfFunds | null;
  sourceOfFundsOther?: string | null;
  kycDocumentsJson?: KycDocumentsChecklist;
  declarationSignedAt?: Date | null;
  declarationSignatory?: string | null;
  kycStatus?: KycStatus;
  kycNotes?: string | null;
};

function trimOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function parseDateOrNull(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function parseUboRows(value: unknown): UboRow[] {
  if (!Array.isArray(value)) return [];
  const rows: UboRow[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const raw = row as Record<string, unknown>;
    const fullName = trimOrNull(raw.fullName);
    if (!fullName) continue;
    rows.push({
      fullName,
      dob: trimOrNull(raw.dob),
      nationality: trimOrNull(raw.nationality),
      address: trimOrNull(raw.address),
      controlPct:
        raw.controlPct === null || raw.controlPct === undefined
          ? null
          : Number(raw.controlPct),
    });
  }
  return rows;
}

function parseKycDocuments(value: unknown): KycDocumentsChecklist {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>;
  return {
    idDocument: Boolean(raw.idDocument),
    proofOfAddress: Boolean(raw.proofOfAddress),
    companyRegistration: Boolean(raw.companyRegistration),
    taxClearance: Boolean(raw.taxClearance),
    trustDeed: Boolean(raw.trustDeed),
    otherNotes: trimOrNull(raw.otherNotes),
    fileIds: Array.isArray(raw.fileIds)
      ? raw.fileIds.filter((id): id is string => typeof id === "string")
      : [],
  };
}

function syncLegacyFields(input: ClientInput): ClientInput {
  const type = normalizeClientType(input.clientType);
  const synced = { ...input, clientType: type };

  if (type === "individual") {
    synced.fullName =
      clientDisplayName({
        clientType: type,
        firstName: synced.firstName,
        surname: synced.surname,
        otherNames: synced.otherNames,
        fullName: synced.fullName,
      }) || null;
    synced.nationalIdOrRegNumber = synced.idNumber ?? synced.nationalIdOrRegNumber;
    synced.physicalAddress = synced.residentialAddress ?? synced.physicalAddress;
  } else {
    synced.registeredName = synced.registeredName ?? synced.legalName;
    synced.legalName = synced.registeredName ?? synced.legalName;
    synced.regTaxNumber = synced.regTaxNumber ?? synced.taxNumber;
    synced.taxNumber = synced.regTaxNumber ?? synced.taxNumber;
    synced.fullName = synced.registeredName ?? synced.tradingName ?? synced.legalName;
    synced.nationalIdOrRegNumber = synced.regTaxNumber ?? synced.nationalIdOrRegNumber;
  }

  return synced;
}

export function parseClientInput(body: unknown, opts?: { requireKycCore?: boolean }): ClientInput {
  if (!body || typeof body !== "object") {
    throw new AuthError("validation", "Invalid client payload.");
  }
  const raw = body as Record<string, unknown>;
  const clientType = normalizeClientType(String(raw.clientType ?? "individual"));
  if (!CLIENT_TYPES.includes(clientType)) {
    throw new AuthError("validation", "Invalid client type.");
  }

  const sourceRaw = trimOrNull(raw.sourceOfFunds);
  const sourceValues = SOURCE_OF_FUNDS_OPTIONS.map((o) => o.value);
  const sourceOfFunds =
    sourceRaw && sourceValues.includes(sourceRaw as SourceOfFunds)
      ? (sourceRaw as SourceOfFunds)
      : null;

  const kycStatusRaw = trimOrNull(raw.kycStatus);
  const kycStatus =
    kycStatusRaw === "complete" || kycStatusRaw === "review_due" || kycStatusRaw === "draft"
      ? kycStatusRaw
      : "draft";

  const input: ClientInput = syncLegacyFields({
    clientType,
    firstName: trimOrNull(raw.firstName),
    surname: trimOrNull(raw.surname),
    otherNames: trimOrNull(raw.otherNames),
    maidenName: trimOrNull(raw.maidenName),
    dateOfBirth: parseDateOrNull(raw.dateOfBirth),
    nationality: trimOrNull(raw.nationality),
    idNumber: trimOrNull(raw.idNumber),
    fullName: trimOrNull(raw.fullName),
    legalName: trimOrNull(raw.legalName),
    registeredName: trimOrNull(raw.registeredName),
    tradingName: trimOrNull(raw.tradingName),
    nationalIdOrRegNumber: trimOrNull(raw.nationalIdOrRegNumber),
    regTaxNumber: trimOrNull(raw.regTaxNumber),
    taxNumber: trimOrNull(raw.taxNumber),
    incorporationDate: parseDateOrNull(raw.incorporationDate),
    incorporationCountry: trimOrNull(raw.incorporationCountry),
    email: trimOrNull(raw.email),
    phone: trimOrNull(raw.phone),
    whatsapp: trimOrNull(raw.whatsapp),
    altPhone: trimOrNull(raw.altPhone),
    residentialAddress: trimOrNull(raw.residentialAddress),
    registeredAddress: trimOrNull(raw.registeredAddress),
    businessAddress: trimOrNull(raw.businessAddress),
    physicalAddress: trimOrNull(raw.physicalAddress),
    postalAddress: trimOrNull(raw.postalAddress),
    occupation: trimOrNull(raw.occupation),
    employer: trimOrNull(raw.employer),
    industry: trimOrNull(raw.industry),
    responsibleLawyerId: trimOrNull(raw.responsibleLawyerId),
    pepStatus: Boolean(raw.pepStatus),
    pepDetails: trimOrNull(raw.pepDetails),
    uboJson: parseUboRows(raw.uboJson),
    matterScopePurpose: trimOrNull(raw.matterScopePurpose),
    sourceOfFunds,
    sourceOfFundsOther: trimOrNull(raw.sourceOfFundsOther),
    kycDocumentsJson: parseKycDocuments(raw.kycDocumentsJson),
    declarationSignedAt: parseDateOrNull(raw.declarationSignedAt),
    declarationSignatory: trimOrNull(raw.declarationSignatory),
    kycStatus,
    kycNotes: trimOrNull(raw.kycNotes),
  });

  validateClientInput(input, opts);
  return input;
}

export function validateClientInput(
  input: ClientInput,
  opts?: { requireKycCore?: boolean },
): void {
  const requireCore = opts?.requireKycCore ?? false;
  const type = normalizeClientType(input.clientType);

  if (requireCore) {
    if (!input.phone) {
      throw new AuthError("validation", "Phone is required.");
    }
    if (!input.whatsapp) {
      throw new AuthError("validation", "WhatsApp number is required.");
    }
    if (type === "individual") {
      if (!input.firstName) {
        throw new AuthError("validation", "First name is required.");
      }
      if (!input.surname) {
        throw new AuthError("validation", "Surname is required.");
      }
    } else if (!input.registeredName && !input.legalName) {
      throw new AuthError("validation", "Registered name is required.");
    }
  } else if (type === "individual" && !input.firstName && !input.fullName) {
    throw new AuthError("validation", "First name or full name is required for individuals.");
  } else if (type !== "individual" && !input.registeredName && !input.legalName) {
    throw new AuthError("validation", "Registered / legal name is required.");
  }

  if (input.email && !isValidEmail(input.email)) {
    throw new AuthError("validation", "Email address is invalid.");
  }

  if (input.sourceOfFunds === "other" && !input.sourceOfFundsOther) {
    throw new AuthError("validation", "Please specify the source of funds.");
  }
}
