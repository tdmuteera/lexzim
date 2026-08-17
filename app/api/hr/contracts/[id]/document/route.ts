import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { getHrContract, setHrContractDocument } from "@/lib/repos/hr";
import { requirePermission } from "@/lib/rbac/guards";
import {
  createSignedDownloadUrl,
  hrContractStoragePath,
  sanitizeFileName,
  uploadFirmFile,
  validateUploadFile,
} from "@/lib/storage/firm-files";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST multipart upload for contract document
 * GET signed download URL
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("hr.view");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const row = await getHrContract(firmId, id);
    if (!row?.contract.contractDocumentPath) {
      throw new AuthError("not_found", "No contract document on file.");
    }

    const url = await createSignedDownloadUrl(row.contract.contractDocumentPath, firmId);
    return jsonOk({
      url,
      fileName: row.contract.contractDocumentName,
    });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("hr.manage");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const existing = await getHrContract(firmId, id);
    if (!existing) {
      throw new AuthError("not_found", "Contract not found.");
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new AuthError("validation", "Multipart field `file` is required.");
    }
    validateUploadFile(file);

    const fileName = sanitizeFileName(file.name);
    const mimeType = file.type || "application/octet-stream";
    const storagePath = hrContractStoragePath({
      firmId,
      contractId: id,
      fileName,
    });

    const bytes = Buffer.from(await file.arrayBuffer());
    await uploadFirmFile({
      storagePath,
      firmId,
      bytes,
      contentType: mimeType,
      upsert: true,
    });

    const contract = await setHrContractDocument(firmId, id, fileName, storagePath);
    if (!contract) {
      throw new AuthError("not_found", "Contract not found.");
    }

    await writeAuditLog({
      action: "hr_contract.document_upload",
      firmId,
      userId: session.id,
      entityType: "hr_contract",
      entityId: id,
      metadata: { fileName, staffProfileId: contract.staffProfileId },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({
      contractDocumentName: contract.contractDocumentName,
      hasDocument: true,
    });
  } catch (err) {
    return jsonError(err, request);
  }
}
