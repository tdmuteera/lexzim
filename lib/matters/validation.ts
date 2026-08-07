import { AuthError } from "@/lib/auth/types";
import {
  AREA_OF_LAW_OPTIONS,
  type AreaOfLaw,
  type ConflictCheckStatus,
  type MatterStatus,
} from "@/lib/db/mvp-types";

export const MATTER_STATUSES: MatterStatus[] = [
  "prospective",
  "open",
  "on_hold",
  "closed",
  "archived",
];

export const OPEN_MATTER_STATUSES: MatterStatus[] = ["prospective", "open", "on_hold"];
export const CLOSED_MATTER_STATUSES: MatterStatus[] = ["closed", "archived"];

export const CONFLICT_STATUSES: ConflictCheckStatus[] = [
  "pending",
  "clear",
  "flagged",
  "not_done",
];

export const MATTER_PRIORITIES = ["low", "normal", "high", "urgent"] as const;

export type MatterInput = {
  clientId: string;
  title: string;
  description?: string | null;
  areaOfLaw: AreaOfLaw | string;
  status?: MatterStatus;
  matterNumber?: string | null;
  fileRef?: string | null;
  courtName?: string | null;
  caseNumber?: string | null;
  responsibleLawyerId?: string | null;
  nextHearingAt?: string | null;
  priority?: string | null;
  conflictCheckStatus?: ConflictCheckStatus;
};

function trimOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function requireString(value: unknown, label: string): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) throw new AuthError("validation", `${label} is required.`);
  return trimmed;
}

export function parseMatterInput(body: unknown, opts?: { requireClientId?: boolean }): MatterInput {
  if (!body || typeof body !== "object") {
    throw new AuthError("validation", "Invalid matter payload.");
  }
  const raw = body as Record<string, unknown>;
  const requireClientId = opts?.requireClientId !== false;

  const clientId = trimOrNull(raw.clientId);
  if (requireClientId && !clientId) {
    throw new AuthError("validation", "Client is required.");
  }

  const areaOfLaw = requireString(raw.areaOfLaw, "Area of law");
  if (!AREA_OF_LAW_OPTIONS.includes(areaOfLaw as AreaOfLaw)) {
    throw new AuthError("validation", "Invalid area of law.");
  }

  let status: MatterStatus | undefined;
  if (raw.status !== undefined && raw.status !== null && raw.status !== "") {
    if (!MATTER_STATUSES.includes(raw.status as MatterStatus)) {
      throw new AuthError("validation", "Invalid matter status.");
    }
    status = raw.status as MatterStatus;
  }

  let conflictCheckStatus: ConflictCheckStatus | undefined;
  if (
    raw.conflictCheckStatus !== undefined &&
    raw.conflictCheckStatus !== null &&
    raw.conflictCheckStatus !== ""
  ) {
    if (!CONFLICT_STATUSES.includes(raw.conflictCheckStatus as ConflictCheckStatus)) {
      throw new AuthError("validation", "Invalid conflict check status.");
    }
    conflictCheckStatus = raw.conflictCheckStatus as ConflictCheckStatus;
  }

  const priority = trimOrNull(raw.priority) ?? "normal";
  if (!MATTER_PRIORITIES.includes(priority as (typeof MATTER_PRIORITIES)[number])) {
    throw new AuthError("validation", "Invalid priority.");
  }

  const nextHearingRaw = trimOrNull(raw.nextHearingAt);
  if (nextHearingRaw && Number.isNaN(Date.parse(nextHearingRaw))) {
    throw new AuthError("validation", "Next hearing date is invalid.");
  }

  return {
    clientId: clientId ?? "",
    title: requireString(raw.title, "Title"),
    description: trimOrNull(raw.description),
    areaOfLaw,
    status,
    matterNumber: trimOrNull(raw.matterNumber),
    fileRef: trimOrNull(raw.fileRef),
    courtName: trimOrNull(raw.courtName),
    caseNumber: trimOrNull(raw.caseNumber),
    responsibleLawyerId: trimOrNull(raw.responsibleLawyerId),
    nextHearingAt: nextHearingRaw,
    priority,
    conflictCheckStatus,
  };
}

export function parseMatterStatus(body: unknown): MatterStatus {
  if (!body || typeof body !== "object") {
    throw new AuthError("validation", "Invalid status payload.");
  }
  const status = (body as Record<string, unknown>).status;
  if (!MATTER_STATUSES.includes(status as MatterStatus)) {
    throw new AuthError("validation", "Invalid matter status.");
  }
  return status as MatterStatus;
}

export function statusLabel(status: string): string {
  switch (status) {
    case "prospective":
      return "Prospective";
    case "open":
      return "Open";
    case "on_hold":
      return "On hold";
    case "closed":
      return "Closed";
    case "archived":
      return "Archived";
    default:
      return status;
  }
}
