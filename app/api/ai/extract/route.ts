import { jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { extractAttachment } from "@/lib/ai/attachments";
import { requirePermission } from "@/lib/rbac/guards";

const MAX_FILES = 8;
const MAX_BYTES = 12 * 1024 * 1024;

/** Extract text from uploaded scans, Word, PDF, or images (OCR). */
export async function POST(request: Request) {
  try {
    await requirePermission("ai.use");
    const form = await request.formData();
    const files = form.getAll("files").filter((v): v is File => v instanceof File);
    if (!files.length) {
      throw new AuthError("validation", "Attach at least one file.");
    }
    if (files.length > MAX_FILES) {
      throw new AuthError("validation", `Attach at most ${MAX_FILES} files at a time.`);
    }

    const extracted = [];
    for (const file of files) {
      if (file.size > MAX_BYTES) {
        throw new AuthError("validation", `${file.name} is larger than 12 MB.`);
      }
      const bytes = Buffer.from(await file.arrayBuffer());
      extracted.push(
        await extractAttachment({
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          bytes,
        }),
      );
    }

    return jsonOk({ files: extracted });
  } catch (err) {
    return jsonError(err);
  }
}
