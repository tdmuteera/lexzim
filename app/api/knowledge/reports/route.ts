import { randomUUID } from "crypto";
import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import {
  createKnowledgeReport,
  knowledgeReportStoragePath,
  listKnowledgeReports,
  serializeKnowledgeReport,
} from "@/lib/repos/knowledge-reports";
import { requirePermission } from "@/lib/rbac/guards";
import {
  sanitizeFileName,
  uploadFirmFile,
  validateUploadFile,
} from "@/lib/storage/firm-files";
import { tenantFirmId } from "@/lib/tenant/scope";

/**
 * GET/POST /api/knowledge/reports
 */
export async function GET(request: Request) {
  try {
    const session = await requirePermission("knowledge.reports.view");
    const firmId = tenantFirmId(session);
    const rows = await listKnowledgeReports(firmId);
    return jsonOk({ items: rows.map(serializeKnowledgeReport) });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("knowledge.reports.manage");
    const firmId = tenantFirmId(session);

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new AuthError("validation", "Choose a file to upload.");
    }
    validateUploadFile(file);

    const titleRaw = form.get("title");
    const title =
      typeof titleRaw === "string" && titleRaw.trim()
        ? titleRaw.trim()
        : file.name.replace(/\.[^.]+$/, "") || file.name;

    const reportDateRaw = form.get("reportDate");
    const reportDate =
      typeof reportDateRaw === "string" && reportDateRaw.trim()
        ? reportDateRaw.trim()
        : new Date().toISOString().slice(0, 10);

    const authorUserIdRaw = form.get("authorUserId");
    const authorUserId =
      typeof authorUserIdRaw === "string" && authorUserIdRaw.trim()
        ? authorUserIdRaw.trim()
        : null;

    const authorNameRaw = form.get("authorName");
    const authorName =
      typeof authorNameRaw === "string" && authorNameRaw.trim()
        ? authorNameRaw.trim()
        : null;

    const eventNameRaw = form.get("eventName");
    const eventName =
      typeof eventNameRaw === "string" && eventNameRaw.trim()
        ? eventNameRaw.trim()
        : null;

    const notesRaw = form.get("notes");
    const notes =
      typeof notesRaw === "string" && notesRaw.trim() ? notesRaw.trim() : null;

    const reportId = randomUUID();
    const fileName = sanitizeFileName(file.name);
    const mimeType = file.type || "application/octet-stream";
    const storagePath = knowledgeReportStoragePath({
      firmId,
      reportId,
      fileName,
    });

    await uploadFirmFile({
      storagePath,
      firmId,
      bytes: Buffer.from(await file.arrayBuffer()),
      contentType: mimeType,
    });

    const row = await createKnowledgeReport(firmId, {
      id: reportId,
      title,
      reportDate,
      authorUserId,
      authorName,
      eventName,
      notes,
      fileName,
      contentType: mimeType,
      byteSize: file.size,
      storagePath,
      createdBy: session.id,
    });

    await writeAuditLog({
      action: "knowledge.report.upload",
      firmId,
      userId: session.id,
      entityType: "knowledge_report",
      entityId: row.id,
      metadata: { title: row.title, fileName: row.fileName, eventName: row.eventName },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ item: serializeKnowledgeReport(row) }, { status: 201 });
  } catch (err) {
    return jsonError(err, request);
  }
}
