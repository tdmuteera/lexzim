import type { documents } from "@/lib/db/schema";

type DocumentRow = typeof documents.$inferSelect;

export function serializeDocument(
  row: DocumentRow,
  extras?: { createdByName?: string | null },
) {
  return {
    id: row.id,
    firmId: row.firmId,
    matterId: row.matterId,
    clientId: row.clientId,
    title: row.title,
    fileName: row.fileName,
    mimeType: row.mimeType,
    storagePath: row.storagePath,
    sizeBytes: row.sizeBytes,
    docType: row.docType,
    templateId: row.templateId,
    createdBy: row.createdBy,
    createdByName: extras?.createdByName ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function formatBytes(size: number | null | undefined): string {
  if (size == null || size <= 0) return "—";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
