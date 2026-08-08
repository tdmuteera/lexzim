import { AuthError } from "@/lib/auth/types";
import {
  AREA_OF_LAW_OPTIONS,
  type AreaOfLaw,
  type ConflictCheckStatus,
  type MatterStatus,
} from "@/lib/db/mvp-types";
import { CONFLICT_STATUSES, MATTER_STATUSES } from "@/lib/matters/validation";

export type ConvertIntakeInput = {
  clientType: "individual" | "company";
  fullName: string | null;
  legalName: string | null;
  title: string;
  areaOfLaw: string;
  matterStatus: MatterStatus;
  matterDescription: string | null;
  opposingPartyName: string | null;
  responsibleLawyerId: string | null;
  conflictCheckStatus: ConflictCheckStatus;
};

function trimOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function resolveAreaOfLaw(
  preferred: string | null | undefined,
  fallback: string | null | undefined,
): string | null {
  const candidates = [preferred, fallback].filter(Boolean) as string[];
  for (const c of candidates) {
    const trimmed = c.trim();
    if (AREA_OF_LAW_OPTIONS.includes(trimmed as AreaOfLaw)) return trimmed;
  }
  return null;
}

export function parseConvertIntakeInput(body: unknown): ConvertIntakeInput {
  if (!body || typeof body !== "object") {
    throw new AuthError("validation", "Invalid conversion payload.");
  }
  const raw = body as Record<string, unknown>;

  const clientType =
    raw.clientType === "company" ? "company" : ("individual" as const);

  const fullName = trimOrNull(raw.fullName);
  const legalName = trimOrNull(raw.legalName);
  if (clientType === "individual" && !fullName) {
    throw new AuthError("validation", "Client full name is required.");
  }
  if (clientType === "company" && !legalName) {
    throw new AuthError("validation", "Company legal name is required.");
  }

  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (!title) throw new AuthError("validation", "Matter title is required.");

  const areaOfLaw =
    typeof raw.areaOfLaw === "string" ? raw.areaOfLaw.trim() : "";
  if (!areaOfLaw || !AREA_OF_LAW_OPTIONS.includes(areaOfLaw as AreaOfLaw)) {
    throw new AuthError("validation", "A valid area of law is required.");
  }

  let matterStatus: MatterStatus = "open";
  if (raw.matterStatus != null && raw.matterStatus !== "") {
    if (!MATTER_STATUSES.includes(raw.matterStatus as MatterStatus)) {
      throw new AuthError("validation", "Invalid matter status.");
    }
    matterStatus = raw.matterStatus as MatterStatus;
  }

  let conflictCheckStatus: ConflictCheckStatus = "clear";
  if (raw.conflictCheckStatus != null && raw.conflictCheckStatus !== "") {
    if (!CONFLICT_STATUSES.includes(raw.conflictCheckStatus as ConflictCheckStatus)) {
      throw new AuthError("validation", "Invalid conflict check status.");
    }
    conflictCheckStatus = raw.conflictCheckStatus as ConflictCheckStatus;
  }

  return {
    clientType,
    fullName,
    legalName,
    title,
    areaOfLaw,
    matterStatus,
    matterDescription: trimOrNull(raw.matterDescription),
    opposingPartyName: trimOrNull(raw.opposingPartyName),
    responsibleLawyerId: trimOrNull(raw.responsibleLawyerId),
    conflictCheckStatus,
  };
}

export function conflictStatusForMatter(checkResult: string): ConflictCheckStatus {
  if (checkResult === "clear") return "clear";
  if (checkResult === "conflict" || checkResult === "possible") return "flagged";
  return "pending";
}
