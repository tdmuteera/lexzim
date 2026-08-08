import type { intakes } from "@/lib/db/schema";
import {
  INTAKE_STATUS_LABELS,
  normalizeIntakeStatus,
} from "@/lib/intake/validation";

type IntakeRow = typeof intakes.$inferSelect;

export function serializeIntake(
  row: IntakeRow,
  opts?: { assigneeName?: string | null },
) {
  const statusNorm = normalizeIntakeStatus(row.status);
  return {
    id: row.id,
    firmId: row.firmId,
    status: row.status,
    statusNormalized: statusNorm,
    statusLabel: INTAKE_STATUS_LABELS[row.status] ?? row.status,
    prospectName: row.prospectName,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    areaOfLaw: row.areaOfLaw,
    matterSummary: row.matterSummary,
    opposingParty: row.opposingParty,
    assignedTo: row.assignedTo,
    assigneeName: opts?.assigneeName ?? null,
    convertedClientId: row.convertedClientId,
    convertedMatterId: row.convertedMatterId,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    editable: statusNorm !== "converted",
  };
}
