import { randomUUID } from "crypto";
import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { serializeDocument } from "@/lib/documents/serialize";
import {
  downloadFirmFile,
  matterDocumentStoragePath,
  sanitizeFileName,
  uploadFirmFile,
} from "@/lib/storage/firm-files";
import { buildMatterMergeFields } from "@/lib/templates/build-fields";
import { mergeDocxTemplate, previewMergeFields } from "@/lib/templates/merge";
import { serializeTemplate } from "@/lib/templates/serialize";
import { createMatterEvent } from "@/lib/repos/timeline";
import { createDocumentRecord, getDocumentById } from "@/lib/repos/documents";
import { getMatterById, userCanAccessMatter } from "@/lib/repos/matters";
import { getTemplateById, listTemplates } from "@/lib/repos/templates";
import { canViewAllMatters, requirePermission } from "@/lib/rbac/guards";
import { hasPermission } from "@/lib/rbac/permissions";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

async function assertGenerateAccess(
  firmId: string,
  matterId: string,
  session: { id: string; permissions: string[] | readonly string[] },
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
  if (!matter) {
    throw new AuthError("not_found", "Matter not found.");
  }
  return matter;
}

/** Preview merge fields + available templates for a matter. */
export async function GET(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("documents.manage");
    if (!hasPermission(session, "templates.view")) {
      throw new AuthError("forbidden", "Permission required: templates.view");
    }
    const firmId = tenantFirmId(session);
    const { id: matterId } = await context.params;
    await assertGenerateAccess(firmId, matterId, session);

    const url = new URL(request.url);
    const areaOfLaw = url.searchParams.get("areaOfLaw") ?? undefined;
    const overridesRaw = url.searchParams.get("overrides");
    let overrides: Record<string, string> | null = null;
    if (overridesRaw) {
      try {
        overrides = JSON.parse(overridesRaw) as Record<string, string>;
      } catch {
        throw new AuthError("validation", "Invalid overrides JSON.");
      }
    }

    const values = await buildMatterMergeFields({
      firmId,
      matterId,
      firmName: session.firm.name,
      overrides,
    });

    const templates = await listTemplates(firmId, {
      activeOnly: true,
      areaOfLaw: areaOfLaw || undefined,
    });

    return jsonOk({
      fields: previewMergeFields(values),
      values,
      templates: templates.map((row) =>
        serializeTemplate(row, {
          createdByName: row.createdByName,
          approvedByName: row.approvedByName,
        }),
      ),
      unknownFieldBehaviour:
        "Tokens not present in the values map are left unchanged in the generated .docx. Empty values clear the token.",
    });
  } catch (err) {
    return jsonError(err);
  }
}

/** Generate a .docx from a template and attach it to the matter. */
export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("documents.manage");
    const firmId = tenantFirmId(session);
    const { id: matterId } = await context.params;
    const matter = await assertGenerateAccess(firmId, matterId, session);

    const body = (await request.json()) as {
      templateId?: unknown;
      title?: unknown;
      overrides?: Record<string, string> | null;
    };

    const templateId = typeof body.templateId === "string" ? body.templateId.trim() : "";
    if (!templateId) {
      throw new AuthError("validation", "templateId is required.");
    }

    const template = await getTemplateById(firmId, templateId);
    if (!template) {
      throw new AuthError("not_found", "Template not found.");
    }
    if (template.bodyFormat !== "docx") {
      throw new AuthError("validation", "Only .docx templates can be merged in Phase 1.");
    }

    const values = await buildMatterMergeFields({
      firmId,
      matterId,
      firmName: session.firm.name,
      overrides: body.overrides ?? null,
    });

    const templateBytes = await downloadFirmFile(template.storagePath, firmId);
    const merged = await mergeDocxTemplate(templateBytes, values);

    const documentId = randomUUID();
    const title =
      typeof body.title === "string" && body.title.trim()
        ? body.title.trim()
        : `${template.title} — ${matter.title}`;
    const fileName = sanitizeFileName(
      `${title.replace(/[^\w\- ]+/g, "").trim() || "generated"}.docx`,
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
      bytes: merged.buffer,
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

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
      sizeBytes: merged.buffer.length,
      docType: "generated_template",
      templateId: template.id,
      createdBy: session.id,
    });

    await createMatterEvent({
      firmId,
      matterId,
      eventType: "document",
      title: `Generated from template: ${template.title}`,
      body: title,
      createdBy: session.id,
    });

    await writeAuditLog({
      action: "documents.generate",
      firmId,
      userId: session.id,
      entityType: "document",
      entityId: row.id,
      metadata: {
        matterId,
        templateId: template.id,
        resolvedFields: merged.resolvedFields,
        unresolvedFields: merged.unresolvedFields,
        leftoverTokens: merged.leftoverTokens,
      },
      ipOrUserAgent: clientInfo(request),
    });

    const full = await getDocumentById(firmId, row.id);
    return jsonOk(
      {
        document: serializeDocument(full ?? row, {
          createdByName: full?.createdByName,
        }),
        merge: {
          resolvedFields: merged.resolvedFields,
          unresolvedFields: merged.unresolvedFields,
          leftoverTokens: merged.leftoverTokens,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    return jsonError(err);
  }
}
