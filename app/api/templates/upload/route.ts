import { randomUUID } from "crypto";
import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { serializeTemplate } from "@/lib/templates/serialize";
import {
  createTemplateRecord,
  getTemplateById,
} from "@/lib/repos/templates";
import { requireAny } from "@/lib/rbac/guards";
import {
  sanitizeFileName,
  templateStoragePath,
  uploadFirmFile,
  validateUploadFile,
} from "@/lib/storage/firm-files";
import { tenantFirmId } from "@/lib/tenant/scope";
import { AREA_OF_LAW_OPTIONS } from "@/lib/db/mvp-types";

export async function POST(request: Request) {
  try {
    const session = await requireAny(["templates.manage", "documents.manage"]);
    const firmId = tenantFirmId(session);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new AuthError("validation", "Choose a file to add as a template.");
    }
    validateUploadFile(file);

    const titleRaw = form.get("title");
    const title =
      typeof titleRaw === "string" && titleRaw.trim()
        ? titleRaw.trim()
        : file.name.replace(/\.[^.]+$/, "") || "Untitled template";

    const areaRaw = form.get("areaOfLaw");
    const areaOfLaw =
      typeof areaRaw === "string" &&
      (AREA_OF_LAW_OPTIONS as readonly string[]).includes(areaRaw)
        ? areaRaw
        : "Civil";

    const descRaw = form.get("description");
    const description =
      typeof descRaw === "string" && descRaw.trim() ? descRaw.trim() : null;

    const templateId = randomUUID();
    const fileName = sanitizeFileName(file.name);
    const mimeType = file.type || "application/octet-stream";
    const storagePath = templateStoragePath({
      firmId,
      templateId,
      version: 1,
      fileName,
    });

    await uploadFirmFile({
      storagePath,
      firmId,
      bytes: Buffer.from(await file.arrayBuffer()),
      contentType: mimeType,
    });

    const row = await createTemplateRecord({
      id: templateId,
      firmId,
      title,
      areaOfLaw,
      description,
      storagePath,
      version: 1,
      createdBy: session.id,
      bodyFormat: mimeType.includes("pdf") ? "pdf" : "docx",
    });

    await writeAuditLog({
      action: "templates.upload",
      firmId,
      userId: session.id,
      entityType: "template",
      entityId: row.id,
      metadata: { title: row.title, fileName, mimeType },
      ipOrUserAgent: clientInfo(request),
    });

    const full = await getTemplateById(firmId, row.id);
    return jsonOk(
      {
        template: serializeTemplate(full ?? row, {
          createdByName: full?.createdByName,
          approvedByName: full?.approvedByName,
        }),
      },
      { status: 201 },
    );
  } catch (err) {
    return jsonError(err, request);
  }
}
