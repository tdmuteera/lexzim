import { AuthError } from "@/lib/auth/types";
import type { ProcedureStatus } from "@/lib/db/mvp-types";

export const PROCEDURE_STATUSES: ProcedureStatus[] = ["todo", "done", "cancelled"];

export type ProcedureInput = {
  title: string;
  description?: string | null;
  dueAt?: string | null;
  assignedTo?: string | null;
  status?: ProcedureStatus;
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

export function parseProcedureInput(body: unknown): ProcedureInput {
  if (!body || typeof body !== "object") {
    throw new AuthError("validation", "Invalid procedure payload.");
  }
  const raw = body as Record<string, unknown>;

  const dueAt = trimOrNull(raw.dueAt);
  if (dueAt && Number.isNaN(Date.parse(dueAt))) {
    throw new AuthError("validation", "Due date is invalid.");
  }

  let status: ProcedureStatus | undefined;
  if (raw.status !== undefined && raw.status !== null && raw.status !== "") {
    if (!PROCEDURE_STATUSES.includes(raw.status as ProcedureStatus)) {
      throw new AuthError("validation", "Invalid procedure status.");
    }
    status = raw.status as ProcedureStatus;
  }

  return {
    title: requireString(raw.title, "Title"),
    description: trimOrNull(raw.description),
    dueAt,
    assignedTo: trimOrNull(raw.assignedTo),
    status,
  };
}

export function parseProcedureStatus(body: unknown): ProcedureStatus {
  if (!body || typeof body !== "object") {
    throw new AuthError("validation", "Invalid status payload.");
  }
  const status = (body as Record<string, unknown>).status;
  if (!PROCEDURE_STATUSES.includes(status as ProcedureStatus)) {
    throw new AuthError("validation", "Invalid procedure status.");
  }
  return status as ProcedureStatus;
}

export function procedureStatusLabel(status: string): string {
  switch (status) {
    case "todo":
      return "To do";
    case "done":
      return "Done";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

/** True when status is todo and dueAt is before now. */
export function isProcedureOverdue(status: string, dueAt: Date | string | null): boolean {
  if (status !== "todo" || !dueAt) return false;
  const due = typeof dueAt === "string" ? new Date(dueAt) : dueAt;
  if (Number.isNaN(due.getTime())) return false;
  return due.getTime() < Date.now();
}
