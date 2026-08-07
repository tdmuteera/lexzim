import type { matters } from "@/lib/db/schema";
import { statusLabel } from "@/lib/matters/validation";

type MatterRow = typeof matters.$inferSelect;

export function serializeMatter(
  row: MatterRow,
  extras?: {
    clientDisplayName?: string | null;
    responsibleLawyerName?: string | null;
  },
) {
  return {
    id: row.id,
    firmId: row.firmId,
    clientId: row.clientId,
    title: row.title,
    description: row.description,
    areaOfLaw: row.areaOfLaw,
    status: row.status,
    statusLabel: statusLabel(row.status),
    matterNumber: row.matterNumber,
    fileRef: row.fileRef,
    courtName: row.courtName,
    caseNumber: row.caseNumber,
    responsibleLawyerId: row.responsibleLawyerId,
    openedAt: row.openedAt ? row.openedAt.toISOString() : null,
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
    nextHearingAt: row.nextHearingAt ? row.nextHearingAt.toISOString() : null,
    priority: row.priority,
    conflictCheckStatus: row.conflictCheckStatus,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    clientDisplayName: extras?.clientDisplayName ?? null,
    responsibleLawyerName: extras?.responsibleLawyerName ?? null,
  };
}
