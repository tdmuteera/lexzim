import type { templates } from "@/lib/db/schema";

type TemplateRow = typeof templates.$inferSelect;

export function serializeTemplate(
  row: TemplateRow,
  extras?: {
    approvedByName?: string | null;
    createdByName?: string | null;
  },
) {
  return {
    id: row.id,
    firmId: row.firmId,
    title: row.title,
    areaOfLaw: row.areaOfLaw,
    description: row.description,
    bodyFormat: row.bodyFormat,
    storagePath: row.storagePath,
    version: row.version,
    isActive: row.isActive,
    approvedBy: row.approvedBy,
    approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
    approvedByName: extras?.approvedByName ?? null,
    createdBy: row.createdBy,
    createdByName: extras?.createdByName ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    isApproved: Boolean(row.approvedAt && row.approvedBy),
  };
}
