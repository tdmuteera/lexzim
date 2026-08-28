import { AuthError } from "@/lib/auth/types";

/** Canonical conflict check results (P10-13). */
export const CONFLICT_RESULTS = ["clear", "potential", "blocked", "not_done"] as const;
export type ConflictResult = (typeof CONFLICT_RESULTS)[number];

/** Map legacy DB values onto clear | potential | blocked | not_done. */
export function normalizeConflictResult(raw: string | null | undefined): ConflictResult {
  const value = (raw ?? "not_done").trim().toLowerCase();
  if (value === "clear") return "clear";
  if (value === "potential" || value === "possible") return "potential";
  if (value === "blocked" || value === "conflict") return "blocked";
  if (value === "not_done" || value === "not-done" || value === "") return "not_done";
  return "not_done";
}

export function isRecordableConflictResult(
  value: unknown,
): value is Exclude<ConflictResult, "not_done"> {
  return value === "clear" || value === "potential" || value === "blocked";
}

export type ConflictCheckInput = {
  clientId: string;
  query: string;
  result: Exclude<ConflictResult, "not_done">;
  notes?: string | null;
  matterId?: string | null;
  intakeId?: string | null;
};

export function parseConflictCheckInput(body: unknown): ConflictCheckInput {
  if (!body || typeof body !== "object") {
    throw new AuthError("validation", "Invalid conflict check payload.");
  }
  const raw = body as Record<string, unknown>;
  const clientId = typeof raw.clientId === "string" ? raw.clientId.trim() : "";
  if (!clientId) {
    throw new AuthError("validation", "clientId is required.");
  }
  const query = typeof raw.query === "string" ? raw.query.trim() : "";
  if (!query) {
    throw new AuthError("validation", "Search query is required.");
  }
  const resultRaw =
    typeof raw.result === "string" ? normalizeConflictResult(raw.result) : "not_done";
  if (!isRecordableConflictResult(resultRaw)) {
    throw new AuthError(
      "validation",
      "Result must be Clear, Potential, or Blocked.",
    );
  }
  const notes =
    raw.notes === undefined || raw.notes === null
      ? null
      : typeof raw.notes === "string"
        ? raw.notes.trim() || null
        : null;
  const matterId =
    typeof raw.matterId === "string" && raw.matterId.trim()
      ? raw.matterId.trim()
      : null;
  const intakeId =
    typeof raw.intakeId === "string" && raw.intakeId.trim()
      ? raw.intakeId.trim()
      : null;

  return {
    clientId,
    query,
    result: resultRaw,
    notes,
    matterId,
    intakeId,
  };
}

export function conflictResultLabel(result: ConflictResult): string {
  switch (result) {
    case "clear":
      return "Clear";
    case "potential":
      return "Potential conflict";
    case "blocked":
      return "Blocked";
    default:
      return "Not done";
  }
}
