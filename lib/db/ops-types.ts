/** Phase 3 practice-ops domain types (P3-01). */

export type CalendarEventType =
  | "hearing"
  | "appointment"
  | "filing"
  | "deadline"
  | "other";

export type MatterDeadlineStatus = "open" | "done" | "cancelled";

export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "void";

export type InvoiceLineType = "time" | "disbursement" | "fee" | "other";

export type TrustLedgerEntryType =
  | "receipt"
  | "disbursement"
  | "transfer"
  | "adjustment";

export type IntakeStatus = "draft" | "open" | "submitted" | "converted" | "declined" | "archived";


export type ConflictCheckResult = "clear" | "conflict" | "possible" | "not_done";

/** firm_settings keys for billing/ops (KV table already exists). */
export const FIRM_SETTING_KEYS = {
  defaultCurrency: "default_currency",
  invoicePrefix: "invoice_prefix",
  nextInvoiceNumber: "next_invoice_number",
  invoiceDueDays: "invoice_due_days",
  browserNotificationsEnabled: "browser_notifications_enabled",
} as const;

export type FirmSettingKey =
  (typeof FIRM_SETTING_KEYS)[keyof typeof FIRM_SETTING_KEYS];

export type CalendarEvent = {
  id: string;
  firmId: string;
  matterId: string | null;
  eventType: CalendarEventType | string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: Date;
  endsAt: Date | null;
  allDay: boolean;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type DeadlineTemplate = {
  id: string;
  firmId: string;
  name: string;
  areaOfLaw: string | null;
  description: string | null;
  offsetDays: number;
  defaultEventType: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type MatterDeadline = {
  id: string;
  firmId: string;
  matterId: string;
  templateId: string | null;
  title: string;
  dueAt: Date;
  status: MatterDeadlineStatus | string;
  notes: string | null;
  calendarEventId: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type TimeEntry = {
  id: string;
  firmId: string;
  matterId: string;
  userId: string;
  workedAt: Date;
  minutes: number;
  billable: boolean;
  rateCents: number | null;
  currency: string | null;
  description: string | null;
  invoiceId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type Disbursement = {
  id: string;
  firmId: string;
  matterId: string;
  description: string;
  amountCents: number;
  currency: string;
  incurredAt: Date;
  billable: boolean;
  invoiceId: string | null;
  createdBy: string | null;
  createdAt: Date;
};

export type Invoice = {
  id: string;
  firmId: string;
  matterId: string;
  clientId: string | null;
  invoiceNumber: string;
  status: InvoiceStatus | string;
  currency: string;
  issueDate: Date | null;
  dueDate: Date | null;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  notes: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type InvoiceLine = {
  id: string;
  firmId: string;
  invoiceId: string;
  lineType: InvoiceLineType | string;
  description: string;
  quantity: number;
  unitAmountCents: number;
  amountCents: number;
  sourceId: string | null;
  sortOrder: number;
  createdAt: Date;
};

export type FeePayment = {
  id: string;
  firmId: string;
  invoiceId: string;
  amountCents: number;
  currency: string;
  paidAt: Date;
  method: string | null;
  reference: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: Date;
};

export type TrustAccount = {
  id: string;
  firmId: string;
  name: string;
  currency: string;
  accountRef: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type TrustLedgerEntry = {
  id: string;
  firmId: string;
  trustAccountId: string;
  matterId: string | null;
  clientId: string | null;
  entryType: TrustLedgerEntryType | string;
  amountCents: number;
  currency: string;
  occurredAt: Date;
  reference: string | null;
  narrative: string | null;
  createdBy: string | null;
  createdAt: Date;
};

export type Intake = {
  id: string;
  firmId: string;
  status: IntakeStatus | string;
  prospectName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  areaOfLaw: string | null;
  matterSummary: string | null;
  opposingParty: string | null;
  assignedTo: string | null;
  convertedClientId: string | null;
  convertedMatterId: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ConflictCheck = {
  id: string;
  firmId: string;
  intakeId: string | null;
  matterId: string | null;
  query: string;
  result: ConflictCheckResult | string;
  notes: string | null;
  checkedBy: string | null;
  checkedAt: Date | null;
  createdAt: Date;
};
