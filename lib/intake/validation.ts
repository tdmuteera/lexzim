import { AuthError } from "@/lib/auth/types";
import type { IntakeStatus } from "@/lib/db/ops-types";

export const INTAKE_STATUSES: IntakeStatus[] = [
  "draft",
  "open",
  "submitted",
  "converted",
  "declined",
  "archived",
];

/** Prompt statuses: open / converted / declined / archived (draft/submitted kept as aliases). */
export const INTAKE_STATUS_LABELS: Record<string, string> = {
  draft: "Open",
  open: "Open",
  submitted: "Open",
  converted: "Converted",
  declined: "Declined",
  archived: "Archived",
};

export type IntakeInput = {
  prospectName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  areaOfLaw: string | null;
  matterSummary: string | null;
  opposingParty: string | null;
  assignedTo: string | null;
  status?: IntakeStatus;
};

function trimOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function isIntakeStatus(value: unknown): value is IntakeStatus {
  return typeof value === "string" && INTAKE_STATUSES.includes(value as IntakeStatus);
}

export function normalizeIntakeStatus(status: string): IntakeStatus {
  if (status === "draft" || status === "submitted") return "open";
  if (isIntakeStatus(status)) return status;
  return "open";
}

export function parseIntakeInput(body: unknown): IntakeInput {
  if (!body || typeof body !== "object") {
    throw new AuthError("validation", "Invalid intake payload.");
  }
  const raw = body as Record<string, unknown>;
  const prospectName =
    typeof raw.prospectName === "string" ? raw.prospectName.trim() : "";
  if (!prospectName) {
    throw new AuthError("validation", "Prospect name is required.");
  }
  if (prospectName.length > 200) {
    throw new AuthError("validation", "Prospect name must be 200 characters or fewer.");
  }

  let status: IntakeStatus | undefined;
  if (raw.status != null) {
    if (!isIntakeStatus(raw.status)) {
      throw new AuthError(
        "validation",
        "Status must be open, converted, declined, archived (or draft/submitted).",
      );
    }
    status = normalizeIntakeStatus(raw.status) === "open" && raw.status === "draft"
      ? "open"
      : normalizeIntakeStatus(raw.status);
    // Persist "open" rather than draft going forward
    if (raw.status === "draft" || raw.status === "submitted" || raw.status === "open") {
      status = "open";
    }
  }

  const email = trimOrNull(raw.contactEmail);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AuthError("validation", "Contact email is invalid.");
  }

  return {
    prospectName,
    contactEmail: email,
    contactPhone: trimOrNull(raw.contactPhone),
    areaOfLaw: trimOrNull(raw.areaOfLaw),
    matterSummary: trimOrNull(raw.matterSummary),
    opposingParty: trimOrNull(raw.opposingParty),
    assignedTo: trimOrNull(raw.assignedTo),
    status,
  };
}

export function assertIntakeEditable(status: string): void {
  const n = normalizeIntakeStatus(status);
  if (n === "converted") {
    throw new AuthError(
      "validation",
      "Converted intakes cannot be edited. Open the linked client/matter instead.",
    );
  }
}
