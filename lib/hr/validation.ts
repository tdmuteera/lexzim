import { AuthError } from "@/lib/auth/types";

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

export type StaffProfileInput = {
  fullName: string;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  department: string | null;
  startDate: Date | null;
  endDate: Date | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  isActive: boolean;
  notes: string | null;
  userId: string | null;
  annualLeaveEntitlementDays: number | null;
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

  return {
    fullName: parseRequiredString(raw.fullName, "fullName", 200),
    email: parseOptionalString(raw.email, 200),
    phone: parseOptionalString(raw.phone, 80),
    jobTitle: parseOptionalString(raw.jobTitle, 120),
    department: parseOptionalString(raw.department, 120),
    startDate: parseOptionalDate(raw.startDate, "startDate"),
    endDate: parseOptionalDate(raw.endDate, "endDate"),
    emergencyContactName: parseOptionalString(raw.emergencyContactName, 200),
    emergencyContactPhone: parseOptionalString(raw.emergencyContactPhone, 80),
    isActive,
    notes: parseOptionalString(raw.notes, 2000),
    userId,
    annualLeaveEntitlementDays,
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
