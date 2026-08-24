import {
  type ClientType,
  type KycDocumentsChecklist,
  type UboRow,
} from "@/lib/clients/kyc-types";

/** Shared KYC form shape (safe for Server + Client imports). */
export type ClientKycFormValues = {
  clientType: ClientType;
  responsibleLawyerId: string;
  firstName: string;
  surname: string;
  otherNames: string;
  maidenName: string;
  dateOfBirth: string;
  nationality: string;
  idNumber: string;
  registeredName: string;
  tradingName: string;
  regTaxNumber: string;
  incorporationDate: string;
  incorporationCountry: string;
  registeredAddress: string;
  businessAddress: string;
  industry: string;
  email: string;
  phone: string;
  whatsapp: string;
  altPhone: string;
  residentialAddress: string;
  postalAddress: string;
  occupation: string;
  employer: string;
  pepStatus: boolean;
  pepDetails: string;
  uboJson: UboRow[];
  matterScopePurpose: string;
  sourceOfFunds: string;
  sourceOfFundsOther: string;
  kycDocumentsJson: KycDocumentsChecklist;
  declarationSignedAt: string;
  declarationSignatory: string;
  kycStatus: string;
  kycNotes: string;
};

export const EMPTY_CLIENT_KYC_FORM_VALUES: ClientKycFormValues = {
  clientType: "individual",
  responsibleLawyerId: "",
  firstName: "",
  surname: "",
  otherNames: "",
  maidenName: "",
  dateOfBirth: "",
  nationality: "",
  idNumber: "",
  registeredName: "",
  tradingName: "",
  regTaxNumber: "",
  incorporationDate: "",
  incorporationCountry: "",
  registeredAddress: "",
  businessAddress: "",
  industry: "",
  email: "",
  phone: "",
  whatsapp: "",
  altPhone: "",
  residentialAddress: "",
  postalAddress: "",
  occupation: "",
  employer: "",
  pepStatus: false,
  pepDetails: "",
  uboJson: [],
  matterScopePurpose: "",
  sourceOfFunds: "",
  sourceOfFundsOther: "",
  kycDocumentsJson: {},
  declarationSignedAt: "",
  declarationSignatory: "",
  kycStatus: "draft",
  kycNotes: "",
};

/** Map a serialized client row into KYC form defaults. Safe on the server. */
export function toClientKycFormValues(
  client: Record<string, unknown>,
): ClientKycFormValues {
  const dateOnly = (value: unknown) =>
    typeof value === "string" && value ? value.slice(0, 10) : "";
  return {
    ...EMPTY_CLIENT_KYC_FORM_VALUES,
    clientType: (client.clientType as ClientType) ?? "individual",
    responsibleLawyerId: String(client.responsibleLawyerId ?? ""),
    firstName: String(client.firstName ?? ""),
    surname: String(client.surname ?? ""),
    otherNames: String(client.otherNames ?? ""),
    maidenName: String(client.maidenName ?? ""),
    dateOfBirth: dateOnly(client.dateOfBirth),
    nationality: String(client.nationality ?? ""),
    idNumber: String(client.idNumber ?? ""),
    registeredName: String(client.registeredName ?? client.legalName ?? ""),
    tradingName: String(client.tradingName ?? ""),
    regTaxNumber: String(client.regTaxNumber ?? client.taxNumber ?? ""),
    incorporationDate: dateOnly(client.incorporationDate),
    incorporationCountry: String(client.incorporationCountry ?? ""),
    registeredAddress: String(client.registeredAddress ?? ""),
    businessAddress: String(client.businessAddress ?? ""),
    industry: String(client.industry ?? ""),
    email: String(client.email ?? ""),
    phone: String(client.phone ?? ""),
    whatsapp: String(client.whatsapp ?? ""),
    altPhone: String(client.altPhone ?? ""),
    residentialAddress: String(
      client.residentialAddress ?? client.physicalAddress ?? "",
    ),
    postalAddress: String(client.postalAddress ?? ""),
    occupation: String(client.occupation ?? ""),
    employer: String(client.employer ?? ""),
    pepStatus: Boolean(client.pepStatus),
    pepDetails: String(client.pepDetails ?? ""),
    uboJson: Array.isArray(client.uboJson) ? (client.uboJson as UboRow[]) : [],
    matterScopePurpose: String(client.matterScopePurpose ?? ""),
    sourceOfFunds: String(client.sourceOfFunds ?? ""),
    sourceOfFundsOther: String(client.sourceOfFundsOther ?? ""),
    kycDocumentsJson: (client.kycDocumentsJson as KycDocumentsChecklist) ?? {},
    declarationSignedAt: dateOnly(client.declarationSignedAt),
    declarationSignatory: String(client.declarationSignatory ?? ""),
    kycStatus: String(client.kycStatus ?? "draft"),
    kycNotes: String(client.kycNotes ?? ""),
  };
}
