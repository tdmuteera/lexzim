import type { deadlineTemplates, matterDeadlines } from "@/lib/db/schema";

type TemplateRow = typeof deadlineTemplates.$inferSelect;
type DeadlineRow = typeof matterDeadlines.$inferSelect;

export function serializeDeadlineTemplate(row: TemplateRow) {
  return {
    id: row.id,
    firmId: row.firmId,
    name: row.name,
    areaOfLaw: row.areaOfLaw,
    description: row.description,
    offsetDays: row.offsetDays,
    defaultEventType: row.defaultEventType,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function serializeMatterDeadline(
  row: DeadlineRow,
  opts?: { now?: Date },
) {
  const now = opts?.now ?? new Date();
  const isOpen = row.status === "open";
  const isOverdue = isOpen && row.dueAt.getTime() < now.getTime();
  return {
    id: row.id,
    firmId: row.firmId,
    matterId: row.matterId,
    templateId: row.templateId,
    title: row.title,
    dueAt: row.dueAt.toISOString(),
    status: row.status,
    notes: row.notes,
    calendarEventId: row.calendarEventId,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    isOverdue,
  };
}
