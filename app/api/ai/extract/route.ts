import { jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import {
  ATTACH_MAX_BYTES,
  ATTACH_MAX_FILES,
  extractAttachment,
  formatAttachmentContext,
} from "@/lib/ai/attachments";
import { requirePermission } from "@/lib/rbac/guards";

export const runtime = "nodejs";
export const maxDuration = 120;

function mbLabel(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

/** Extract text from uploaded scans, Word, PDF, or images (OCR). Soft-fails per file. */
export async function POST(request: Request) {
  try {
    await requirePermission("ai.use");

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new AuthError(
        "validation",
        `Upload could not be read. Attach fewer files or keep each under ${mbLabel(ATTACH_MAX_BYTES)}.`,
      );
    }

    const files = form.getAll("files").filter((v): v is File => v instanceof File);
    if (!files.length) {
      throw new AuthError("validation", "Attach at least one file.");
    }
    if (files.length > ATTACH_MAX_FILES) {
      throw new AuthError(
        "validation",
        `Attach at most ${ATTACH_MAX_FILES} files at a time.`,
      );
    }

    const extracted = [];
    for (const file of files) {
      if (file.size > ATTACH_MAX_BYTES) {
        extracted.push({
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          method: "error" as const,
          text: `(${file.name} is larger than ${mbLabel(ATTACH_MAX_BYTES)}. Compress it or split pages.)`,
        });
        continue;
      }

      try {
        const bytes = Buffer.from(await file.arrayBuffer());
        extracted.push(
          await extractAttachment({
            fileName: file.name,
            mimeType: file.type || "application/octet-stream",
            bytes,
          }),
        );
      } catch (err) {
        extracted.push({
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          method: "error" as const,
          text: `(Could not read ${file.name}: ${err instanceof Error ? err.message : "unknown error"})`,
        });
      }
    }

    return jsonOk({
      files: extracted,
      combinedPreviewChars: formatAttachmentContext(extracted).length,
      limits: {
        maxFiles: ATTACH_MAX_FILES,
        maxBytesPerFile: ATTACH_MAX_BYTES,
      },
    });
  } catch (err) {
    return jsonError(err, request);
  }
}
