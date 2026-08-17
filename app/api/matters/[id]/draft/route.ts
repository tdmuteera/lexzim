import { randomUUID } from "crypto";
import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { AI_DRAFT_BANNER, polishMergedDraft } from "@/lib/ai/drafting/polish";
import { serializeDocument } from "@/lib/documents/serialize";
import {
  downloadFirmFile,
  matterDocumentStoragePath,
  sanitizeFileName,
  uploadFirmFile,
} from "@/lib/storage/firm-files";
import { buildMatterMergeFields } from "@/lib/templates/build-fields";
import {
  extractPlainTextFromDocx,
  mergeDocxTemplate,
} from "@/lib/templates/merge";
import { packPlainTextDocx } from "@/lib/templates/pack-text";
import { createMatterEvent } from "@/lib/repos/timeline";
import { createDocumentRecord, getDocumentById } from "@/lib/repos/documents";
import { getMatterById, userCanAccessMatter } from "@/lib/repos/matters";
import { getTemplateById } from "@/lib/repos/templates";
import { canViewAllMatters, requirePermission } from "@/lib/rbac/guards";
import { hasPermission } from "@/lib/rbac/permissions";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

async function assertDraftAccess(
  firmId: string,
  matterId: string,
  session: { id: string; permissions: string[] | readonly string[]; firm: { name: string } },
) {
  if (!hasPermission(session as never, "documents.manage")) {
    throw new AuthError("forbidden", "Permission required: documents.manage");
  }
  if (!hasPermission(session as never, "templates.view")) {
    throw new AuthError("forbidden", "Permission required: templates.view");
  }
  const viewAll = canViewAllMatters(session as never);
  const allowed = await userCanAccessMatter(firmId, matterId, session.id, viewAll);
  if (!allowed) {
    throw new AuthError("forbidden", "You do not have access to this matter.");
  }
  const matter = await getMatterById(firmId, matterId);
  if (!matter) throw new AuthError("not_found", "Matter not found.");
  return { matter, viewAll };
}

/**
 * Draft assist:
 * - preview: deterministic merge → plain text (no save)
 * - polish: optional AI polish of plain text (merge-only if AI down)
 * - save: pack editable plain text → .docx on matter
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("documents.manage");
    const firmId = tenantFirmId(session);
    const { id: matterId } = await context.params;
    const { matter, viewAll } = await assertDraftAccess(firmId, matterId, session);

    const body = (await request.json()) as {
      action?: string;
      templateId?: string;
      title?: string;
      overrides?: Record<string, string> | null;
      plainText?: string;
      aiAssisted?: boolean;
    };

    const action = (body.action ?? "").trim().toLowerCase();

    if (action === "preview") {
      const templateId = typeof body.templateId === "string" ? body.templateId.trim() : "";
      if (!templateId) throw new AuthError("validation", "templateId is required.");

      const template = await getTemplateById(firmId, templateId);
      if (!template) throw new AuthError("not_found", "Template not found.");
      if (template.bodyFormat !== "docx") {
        throw new AuthError("validation", "Only .docx templates can be drafted.");
      }

      const values = await buildMatterMergeFields({
        firmId,
        matterId,
        firmName: session.firm.name,
        overrides: body.overrides ?? null,
      });

      const templateBytes = await downloadFirmFile(template.storagePath, firmId);
      const merged = await mergeDocxTemplate(templateBytes, values);
      const plainText = await extractPlainTextFromDocx(merged.buffer);
      const title =
        typeof body.title === "string" && body.title.trim()
          ? body.title.trim()
          : `${template.title} — ${matter.title}`;

      await writeAuditLog({
        action: "ai.draft_preview",
        firmId,
        userId: session.id,
        entityType: "template",
        entityId: template.id,
        metadata: {
          matterId,
          resolvedFields: merged.resolvedFields,
          unresolvedFields: merged.unresolvedFields,
        },
        ipOrUserAgent: clientInfo(request),
      });

      return jsonOk({
        action,
        templateId: template.id,
        templateTitle: template.title,
        title,
        plainText,
        banner: AI_DRAFT_BANNER,
        merge: {
          resolvedFields: merged.resolvedFields,
          unresolvedFields: merged.unresolvedFields,
          leftoverTokens: merged.leftoverTokens,
        },
        note: "Deterministic merge only. Review before filing or service. Optional AI polish does not invent forms.",
      });
    }

    if (action === "polish") {
      if (!hasPermission(session, "ai.use")) {
        throw new AuthError("forbidden", "Permission required: ai.use");
      }
      const plainText = typeof body.plainText === "string" ? body.plainText : "";
      if (!plainText.trim()) {
        throw new AuthError("validation", "plainText is required.");
      }

      const result = await polishMergedDraft({
        firmId,
        userId: session.id,
        viewAllMatters: viewAll,
        matterId,
        plainText,
        templateTitle:
          typeof body.title === "string" ? body.title : undefined,
      });

      await writeAuditLog({
        action: "ai.draft_polish",
        firmId,
        userId: session.id,
        entityType: "matter",
        entityId: matterId,
        metadata: {
          polished: result.polished,
          errorCode: result.errorCode ?? null,
          latencyMs: result.latencyMs,
        },
        ipOrUserAgent: clientInfo(request),
      });

      return jsonOk({
        action,
        plainText: result.plainText,
        polished: result.polished,
        banner: AI_DRAFT_BANNER,
        errorCode: result.errorCode ?? null,
        message: result.message ?? null,
        latencyMs: result.latencyMs,
      });
    }

    if (action === "save") {
      const plainText = typeof body.plainText === "string" ? body.plainText.trim() : "";
      if (!plainText) throw new AuthError("validation", "plainText is required.");

      const title =
        typeof body.title === "string" && body.title.trim()
          ? body.title.trim()
          : `Draft — ${matter.title}`;
      const aiAssisted = body.aiAssisted === true;
      const buffer = await packPlainTextDocx({
        title,
        body: plainText,
        aiAssisted,
      });

      const documentId = randomUUID();
      const fileName = sanitizeFileName(
        `${title.replace(/[^\w\- ]+/g, "").trim() || "draft"}.docx`,
      );
      const storagePath = matterDocumentStoragePath({
        firmId,
        matterId,
        documentId,
        fileName,
      });

      await uploadFirmFile({
        storagePath,
        firmId,
        bytes: buffer,
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });

      const templateId =
        typeof body.templateId === "string" && body.templateId.trim()
          ? body.templateId.trim()
          : null;

      const row = await createDocumentRecord({
        id: documentId,
        firmId,
        matterId,
        clientId: matter.clientId,
        title,
        fileName,
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        storagePath,
        sizeBytes: buffer.length,
        docType: "generated_template",
        templateId,
        createdBy: session.id,
      });

      await createMatterEvent({
        firmId,
        matterId,
        eventType: "document",
        title: aiAssisted
          ? `Saved AI-assisted draft: ${title}`
          : `Saved draft from template: ${title}`,
        body: AI_DRAFT_BANNER,
        createdBy: session.id,
      });

      await writeAuditLog({
        action: "ai.draft_save",
        firmId,
        userId: session.id,
        entityType: "document",
        entityId: row.id,
        metadata: {
          matterId,
          templateId,
          aiAssisted,
          chars: plainText.length,
        },
        ipOrUserAgent: clientInfo(request),
      });

      const full = await getDocumentById(firmId, row.id);
      return jsonOk(
        {
          action,
          banner: AI_DRAFT_BANNER,
          document: serializeDocument(full ?? row, {
            createdByName: full?.createdByName,
          }),
        },
        { status: 201 },
      );
    }

    throw new AuthError(
      "validation",
      'action must be "preview", "polish", or "save".',
    );
  } catch (err) {
    return jsonError(err, request);
  }
}
