/** Phase 1 MVP domain types (P1-01). */

export type ClientType = "individual" | "corporate" | "partnership" | "trust" | "company";

export type MatterStatus = "prospective" | "open" | "on_hold" | "closed" | "archived";

export type ProcedureStatus = "todo" | "done" | "cancelled";

export type DocumentType = "uploaded" | "generated_template" | "other";

export type AreaOfLaw =
  | "Civil"
  | "Criminal"
  | "Family"
  | "Labour"
  | "Property/Conveyancing"
  | "Corporate/Commercial"
  | "IP"
  | "Constitutional/Administrative"
  | "Estates & Trusts"
  | "Immigration";

export const AREA_OF_LAW_OPTIONS: AreaOfLaw[] = [
  "Civil",
  "Criminal",
  "Family",
  "Labour",
  "Property/Conveyancing",
  "Corporate/Commercial",
  "IP",
  "Constitutional/Administrative",
  "Estates & Trusts",
  "Immigration",
];

/** Courts commonly used in Harare. Store the display string on matters.court_name. */
export const HARARE_COURT_OPTIONS = [
  "High Court of Zimbabwe, Harare",
  "High Court Commercial Division, Harare",
  "Supreme Court of Zimbabwe",
  "Constitutional Court of Zimbabwe",
  "Labour Court, Harare",
  "Administrative Court, Harare",
  "Harare Magistrates Court (Civil)",
  "Harare Magistrates Court (Criminal)",
  "Harare Magistrates Court (Rotten Row)",
  "Regional Magistrates Court, Harare",
  "Small Claims Court, Harare",
  "Children's Court, Harare",
  "Maintenance Court, Harare",
] as const;

export type HarareCourt = (typeof HARARE_COURT_OPTIONS)[number];

/** Sentinel value for the matter form when the court is not in the Harare list. */
export const COURT_OTHER_VALUE = "__other__";

export type Client = {
  id: string;
  firmId: string;
  clientType: ClientType | string;
  fullName: string | null;
  legalName: string | null;
  tradingName: string | null;
  nationalIdOrRegNumber: string | null;
  taxNumber: string | null;
  email: string | null;
  phone: string | null;
  altPhone: string | null;
  physicalAddress: string | null;
  postalAddress: string | null;
  kycNotes: string | null;
  responsibleLawyerId: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
};

export type Matter = {
  id: string;
  firmId: string;
  clientId: string;
  title: string;
  description: string | null;
  areaOfLaw: string;
  status: MatterStatus | string;
  matterNumber: string | null;
  fileRef: string | null;
  courtName: string | null;
  caseNumber: string | null;
  responsibleLawyerId: string | null;
  openedAt: Date | null;
  closedAt: Date | null;
  nextHearingAt: Date | null;
  priority: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type MatterTeamMember = {
  firmId: string;
  matterId: string;
  userId: string;
  roleOnMatter: string;
  createdAt: Date;
};

export type RelatedParty = {
  id: string;
  firmId: string;
  clientId: string | null;
  matterId: string | null;
  partyRole: string;
  name: string;
  contact: string | null;
  notes: string | null;
  createdAt: Date;
};

export type PendingProcedure = {
  id: string;
  firmId: string;
  matterId: string;
  title: string;
  description: string | null;
  dueAt: Date | null;
  status: ProcedureStatus | string;
  assignedTo: string | null;
  completedAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type MatterEvent = {
  id: string;
  firmId: string;
  matterId: string;
  eventType: string;
  title: string;
  body: string | null;
  eventAt: Date;
  createdBy: string | null;
  createdAt: Date;
};

export type Template = {
  id: string;
  firmId: string;
  title: string;
  areaOfLaw: string;
  description: string | null;
  bodyFormat: string;
  storagePath: string;
  version: number;
  isActive: boolean;
  approvedBy: string | null;
  approvedAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type TemplateVersion = {
  id: string;
  firmId: string;
  templateId: string;
  version: number;
  storagePath: string;
  changeNote: string | null;
  createdBy: string | null;
  approvedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type Document = {
  id: string;
  firmId: string;
  matterId: string;
  clientId: string | null;
  title: string;
  fileName: string;
  mimeType: string;
  storagePath: string;
  sizeBytes: number | null;
  docType: DocumentType | string;
  templateId: string | null;
  createdBy: string | null;
  createdAt: Date;
};
