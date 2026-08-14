import type { ExportFormat } from "@/lib/export/types";
import { exportFileExtension, exportMimeType } from "@/lib/export/types";

export function safeExportFilename(base: string, format: ExportFormat): string {
  const stamp = new Date().toISOString().slice(0, 10);
  const slug = base.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");
  return `${slug}-${stamp}.${exportFileExtension(format)}`;
}

export function binaryDownloadResponse(
  filename: string,
  format: ExportFormat,
  bytes: Buffer | Uint8Array,
): Response {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": exportMimeType(format),
      "Content-Disposition": `attachment; filename="${safe}"`,
      "Cache-Control": "no-store",
    },
  });
}
