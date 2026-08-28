import { AuthError } from "@/lib/auth/types";
import {
  HR_JOB_CATEGORIES,
  isHrJobCategory,
  type HrJobCategory,
} from "@/lib/hr/job-categories";

export const HR_CONTRACT_STATUSES = ["draft", "active", "expired", "terminated"] as const;
export type HrContractStatus = (typeof HR_CONTRACT_STATUSES)[number];

function parseOptionalDate(value: unknown, field: string): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") {
    throw new AuthError("validation", `${field} must be a date string.`);
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new AuthError("validation", `${field} is not a valid date.`);
  }
  return d;
}

function parseRequiredDate(value: unknown, field: string): Date {
  const d = parseOptionalDate(value, field);
  if (!d) {
    throw new AuthError("validation", `${field} is required.`);
  }
  return d;
}

function parseOptionalString(value: unknown, max = 500): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") {
    throw new AuthError("validation", "Expected a string value.");
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw new AuthError("validation", `Value exceeds ${max} characters.`);
  }
  return trimmed;
}

function parseRequiredString(value: unknown, field: string, max = 500): string {
  const s = parseOptionalString(value, max);
  if (!s) {
    throw new AuthError("validation", `${field} is required.`);
  }
  return s;
}

function parseOptionalCents(value: unknown, field: string): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw new AuthError("validation", `${field} must be a non-negative integer (cents).`);
  }
  return n;
}

export type StaffProfileInput = {
  fullName: string;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  jobCategory: HrJobCategory | null;
  department: string | null;
  employeeNumber: string | null;
  idPassport: string | null;
  workLocation: string | null;
  startDate: Date | null;
  endDate: Date | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  nokFullName: string | null;
  nokRelationship: string | null;
  nokPhone1: string | null;
  nokPhone2: string | null;
  nokAddress: string | null;
  nokEmail: string | null;
  nokOccupation: string | null;
  nokDeclaredAt: Date | null;
  nokReceivedAt: Date | null;
  grossSalaryCents: number | null;
  netSalaryCents: number | null;
  isActive: boolean;
  notes: string | null;
  userId: string | null;
  annualLeaveEntitlementDays: number | null;
  /**
   * When true and no userId is linked, create a no-login directory lawyer
   * so they appear in responsible-attorney pickers.
   */
  listAsLawyer?: boolean;
  /** When linked user exists: set users.isLawyer explicitly (null = leave unchanged / derive). */
  markAsLawyer?: boolean | null;
};

export function parseStaffProfileInput(body: unknown): StaffProfileInput {
  if (!body || typeof body !== "object") {
    throw new AuthError("validation", "Invalid request body.");
  }
  const raw = body as Record<string, unknown>;

  const userIdRaw = raw.userId;
  let userId: string | null = null;
  if (userIdRaw !== null && userIdRaw !== undefined && userIdRaw !== "") {
    if (typeof userIdRaw !== "string") {
      throw new AuthError("validation", "userId must be a string.");
    }
    userId = userIdRaw.trim();
  }

  const isActive = raw.isActive === undefined ? true : Boolean(raw.isActive);

  let annualLeaveEntitlementDays: number | null = null;
  if (
    raw.annualLeaveEntitlementDays !== null &&
    raw.annualLeaveEntitlementDays !== undefined &&
    raw.annualLeaveEntitlementDays !== ""
  ) {
    const n = Number(raw.annualLeaveEntitlementDays);
    if (!Number.isInteger(n) || n < 0 || n > 365) {
      throw new AuthError("validation", "annualLeaveEntitlementDays must be 0–365.");
    }
    annualLeaveEntitlementDays = n;
  }

  let jobCategory: HrJobCategory | null = null;
  if (raw.jobCategory !== null && raw.jobCategory !== undefined && raw.jobCategory !== "") {
    if (typeof raw.jobCategory !== "string" || !isHrJobCategory(raw.jobCategory)) {
      throw new AuthError(
        "validation",
        `jobCategory must be one of: ${HR_JOB_CATEGORIES.join(", ")}.`,
      );
    }
    jobCategory = raw.jobCategory;
  }

  let markAsLawyer: boolean | null = null;
  if (raw.markAsLawyer !== undefined && raw.markAsLawyer !== null) {
    markAsLawyer = Boolean(raw.markAsLawyer);
  }

  const nokFullName = parseOptionalString(raw.nokFullName, 200);
  const nokPhone1 = parseOptionalString(raw.nokPhone1, 80);
  const emergencyContactName =
    parseOptionalString(raw.emergencyContactName, 200) ?? nokFullName;
  const emergencyContactPhone =
    parseOptionalString(raw.emergencyContactPhone, 80) ?? nokPhone1;

  return {
    fullName: parseRequiredString(raw.fullName, "fullName", 200),
    email: parseOptionalString(raw.email, 200),
    phone: parseOptionalString(raw.phone, 80),
    jobTitle: parseOptionalString(raw.jobTitle, 120),
    jobCategory,
    department: parseOptionalString(raw.department, 120),
    employeeNumber: parseOptionalString(raw.employeeNumber, 80),
    idPassport: parseOptionalString(raw.idPassport, 80),
    workLocation: parseOptionalString(raw.workLocation, 200),
    startDate: parseOptionalDate(raw.startDate, "startDate"),
    endDate: parseOptionalDate(raw.endDate, "endDate"),
    emergencyContactName,
    emergencyContactPhone,
    nokFullName,
    nokRelationship: parseOptionalString(raw.nokRelationship, 120),
    nokPhone1,
    nokPhone2: parseOptionalString(raw.nokPhone2, 80),
    nokAddress: parseOptionalString(raw.nokAddress, 500),
    nokEmail: parseOptionalString(raw.nokEmail, 200),
    nokOccupation: parseOptionalString(raw.nokOccupation, 200),
    nokDeclaredAt: parseOptionalDate(raw.nokDeclaredAt, "nokDeclaredAt"),
    nokReceivedAt: parseOptionalDate(raw.nokReceivedAt, "nokReceivedAt"),
    grossSalaryCents: parseOptionalCents(raw.grossSalaryCents, "grossSalaryCents"),
    netSalaryCents: parseOptionalCents(raw.netSalaryCents, "netSalaryCents"),
    isActive,
    notes: parseOptionalString(raw.notes, 2000),
    userId,
    annualLeaveEntitlementDays,
    listAsLawyer: Boolean(raw.listAsLawyer),
    markAsLawyer,
  };
}

export type HrContractInput = {
  staffProfileId: string;
  title: string;
  startDate: Date;
  endDate: Date | null;
  status: HrContractStatus;
  notes: string | null;
};

export function parseHrContractInput(body: unknown): HrContractInput {
  if (!body || typeof body !== "object") {
    throw new AuthError("validation", "Invalid request body.");
  }
  const raw = body as Record<string, unknown>;

  const staffProfileId = parseRequiredString(raw.staffProfileId, "staffProfileId", 80);
  const statusRaw = raw.status ?? "active";
  if (typeof statusRaw !== "string" || !HR_CONTRACT_STATUSES.includes(statusRaw as HrContractStatus)) {
    throw new AuthError(
      "validation",
      `status must be one of: ${HR_CONTRACT_STATUSES.join(", ")}`,
    );
  }

  return {
    staffProfileId,
    title: parseRequiredString(raw.title, "title", 200),
    startDate: parseRequiredDate(raw.startDate, "startDate"),
    endDate: parseOptionalDate(raw.endDate, "endDate"),
    status: statusRaw as HrContractStatus,
    notes: parseOptionalString(raw.notes, 2000),
  };
}

export type LeaveRequestInput = {
  staffProfileId: string;
  leaveTypeId: string;
  fromDate: Date;
  toDate: Date;
  notes: string | null;
};

export function parseLeaveRequestInput(body: unknown): LeaveRequestInput {
  if (!body || typeof body !== "object") {
    throw new AuthError("validation", "Invalid request body.");
  }
  const raw = body as Record<string, unknown>;
  return {
    staffProfileId: parseRequiredString(raw.staffProfileId, "staffProfileId", 80),
    leaveTypeId: parseRequiredString(raw.leaveTypeId, "leaveTypeId", 80),
    fromDate: parseRequiredDate(raw.fromDate, "fromDate"),
    toDate: parseRequiredDate(raw.toDate, "toDate"),
    notes: parseOptionalString(raw.notes, 2000),
  };
}

export type LeaveDecisionInput = {
  status: "approved" | "rejected" | "cancelled";
  decisionNotes: string | null;
};

export function parseLeaveDecisionInput(body: unknown): LeaveDecisionInput {
  if (!body || typeof body !== "object") {
    throw new AuthError("validation", "Invalid request body.");
  }
  const raw = body as Record<string, unknown>;
  const statusRaw = raw.status;
  if (
    statusRaw !== "approved" &&
    statusRaw !== "rejected" &&
    statusRaw !== "cancelled"
  ) {
    throw new AuthError("validation", "status must be approved, rejected, or cancelled.");
  }
  return {
    status: statusRaw,
    decisionNotes: parseOptionalString(raw.decisionNotes, 2000),
  };
}

export const SALARY_ADVANCE_DECISIONS = [
  "approved",
  "approved_subject_to_amendment",
  "not_approved",
] as const;
export type SalaryAdvanceDecision = (typeof SALARY_ADVANCE_DECISIONS)[number];

export type SalaryAdvanceCreateInput = {
  staffProfileId: string;
  amountCents: number;
  amountInWords: string | null;
  reason: string | null;
  applicationDate: Date | null;
  declarationAcceptedAt: Date;
};

export function parseSalaryAdvanceCreateInput(body: unknown): SalaryAdvanceCreateInput {
  if (!body || typeof body !== "object") {
    throw new AuthError("validation", "Invalid request body.");
  }
  const raw = body as Record<string, unknown>;
  const amountCents = parseOptionalCents(raw.amountCents, "amountCents");
  if (amountCents == null || amountCents <= 0) {
    throw new AuthError("validation", "amountCents must be a positive integer.");
  }
  const declarationAccepted =
    raw.declarationAccepted === true ||
    raw.declarationAcceptedAt === true ||
    (typeof raw.declarationAcceptedAt === "string" &&
      raw.declarationAcceptedAt.trim() !== "");
  if (!declarationAccepted) {
    throw new AuthError(
      "validation",
      "You must accept the employee declaration before submitting.",
    );
  }
  const declarationAcceptedAt =
    typeof raw.declarationAcceptedAt === "string" &&
    raw.declarationAcceptedAt.trim() !== "" &&
    raw.declarationAcceptedAt !== "true"
      ? parseRequiredDate(raw.declarationAcceptedAt, "declarationAcceptedAt")
      : new Date();

  return {
    staffProfileId: parseRequiredString(raw.staffProfileId, "staffProfileId", 80),
    amountCents,
    amountInWords: parseOptionalString(raw.amountInWords, 500),
    reason: parseOptionalString(raw.reason, 2000),
    applicationDate: parseOptionalDate(raw.applicationDate, "applicationDate"),
    declarationAcceptedAt,
  };
}

export type SalaryAdvanceFinanceInput = {
  grossSalaryCents: number | null;
  netSalaryCents: number | null;
  existingAdvanceBalanceCents: number | null;
  proposedAdvanceCents: number | null;
  proposedMonthlyDeductionCents: number | null;
  recommendedMonths: number | null;
  financeNotes: string | null;
};

export function parseSalaryAdvanceFinanceInput(body: unknown): SalaryAdvanceFinanceInput {
  if (!body || typeof body !== "object") {
    throw new AuthError("validation", "Invalid request body.");
  }
  const raw = body as Record<string, unknown>;
  let recommendedMonths: number | null = null;
  if (
    raw.recommendedMonths !== null &&
    raw.recommendedMonths !== undefined &&
    raw.recommendedMonths !== ""
  ) {
    const n = Number(raw.recommendedMonths);
    if (!Number.isInteger(n) || n < 1 || n > 120) {
      throw new AuthError("validation", "recommendedMonths must be 1–120.");
    }
    recommendedMonths = n;
  }
  return {
    grossSalaryCents: parseOptionalCents(raw.grossSalaryCents, "grossSalaryCents"),
    netSalaryCents: parseOptionalCents(raw.netSalaryCents, "netSalaryCents"),
    existingAdvanceBalanceCents: parseOptionalCents(
      raw.existingAdvanceBalanceCents,
      "existingAdvanceBalanceCents",
    ),
    proposedAdvanceCents: parseOptionalCents(raw.proposedAdvanceCents, "proposedAdvanceCents"),
    proposedMonthlyDeductionCents: parseOptionalCents(
      raw.proposedMonthlyDeductionCents,
      "proposedMonthlyDeductionCents",
    ),
    recommendedMonths,
    financeNotes: parseOptionalString(raw.financeNotes, 2000),
  };
}

export type SalaryAdvanceDecideInput = {
  decision: SalaryAdvanceDecision;
  approvedAmountCents: number | null;
  monthlyDeductionCents: number | null;
  repaymentMonths: number | null;
  effectiveDeductionDate: Date | null;
  managementComments: string | null;
};

export function parseSalaryAdvanceDecideInput(body: unknown): SalaryAdvanceDecideInput {
  if (!body || typeof body !== "object") {
    throw new AuthError("validation", "Invalid request body.");
  }
  const raw = body as Record<string, unknown>;
  const decision = raw.decision;
  if (
    typeof decision !== "string" ||
    !SALARY_ADVANCE_DECISIONS.includes(decision as SalaryAdvanceDecision)
  ) {
    throw new AuthError(
      "validation",
      `decision must be one of: ${SALARY_ADVANCE_DECISIONS.join(", ")}`,
    );
  }
  let repaymentMonths: number | null = null;
  if (
    raw.repaymentMonths !== null &&
    raw.repaymentMonths !== undefined &&
    raw.repaymentMonths !== ""
  ) {
    const n = Number(raw.repaymentMonths);
    if (!Number.isInteger(n) || n < 1 || n > 120) {
      throw new AuthError("validation", "repaymentMonths must be 1–120.");
    }
    repaymentMonths = n;
  }
  return {
    decision: decision as SalaryAdvanceDecision,
    approvedAmountCents: parseOptionalCents(raw.approvedAmountCents, "approvedAmountCents"),
    monthlyDeductionCents: parseOptionalCents(
      raw.monthlyDeductionCents,
      "monthlyDeductionCents",
    ),
    repaymentMonths,
    effectiveDeductionDate: parseOptionalDate(
      raw.effectiveDeductionDate,
      "effectiveDeductionDate",
    ),
    managementComments: parseOptionalString(raw.managementComments, 2000),
  };
}

export type PayrollPeriodCreateInput = {
  label: string;
  periodStart: Date;
  periodEnd: Date;
};

export function parsePayrollPeriodCreateInput(body: unknown): PayrollPeriodCreateInput {
  if (!body || typeof body !== "object") {
    throw new AuthError("validation", "Invalid request body.");
  }
  const raw = body as Record<string, unknown>;
  const periodStart = parseRequiredDate(raw.periodStart, "periodStart");
  const periodEnd = parseRequiredDate(raw.periodEnd, "periodEnd");
  if (periodEnd.getTime() < periodStart.getTime()) {
    throw new AuthError("validation", "periodEnd must be on or after periodStart.");
  }
  return {
    label: parseRequiredString(raw.label, "label", 200),
    periodStart,
    periodEnd,
  };
}
