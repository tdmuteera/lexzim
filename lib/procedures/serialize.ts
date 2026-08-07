import type { pendingProcedures } from "@/lib/db/schema";
import {
  isProcedureOverdue,
  procedureStatusLabel,
} from "@/lib/procedures/validation";

type ProcedureRow = typeof pendingProcedures.$inferSelect;

export function serializeProcedure(
  row: ProcedureRow,
  extras?: {
    assigneeName?: string | null;
    matterTitle?: string | null;
  },
) {
  const overdue = isProcedureOverdue(row.status, row.dueAt);
  return {
    id: row.id,
    firmId: row.firmId,
    matterId: row.matterId,
    title: row.title,
    description: row.description,
    dueAt: row.dueAt ? row.dueAt.toISOString() : null,
    status: row.status,
    statusLabel: procedureStatusLabel(row.status),
    assignedTo: row.assignedTo,
    assigneeName: extras?.assigneeName ?? null,
    matterTitle: extras?.matterTitle ?? null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    isOverdue: overdue,
  };
}
