import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { firmStoragePrefix } from "@/lib/tenant/scope";
import { AuthError } from "@/lib/auth/types";

export const FIRM_FILES_BUCKET =
  process.env.SUPABASE_STORAGE_BUCKET?.trim() || "firm-files";

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

export const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "text/plain",
]);

let bucketReady: Promise<void> | null = null;

export function sanitizeFileName(name: string): string {
  const base = name.replace(/[/\\?%*:|"<>]/g, "_").trim() || "file";
  return base.slice(0, 180);
}

export function matterDocumentStoragePath(input: {
  firmId: string;
  matterId: string;
  documentId: string;
  fileName: string;
}): string {
  return `${firmStoragePrefix(input.firmId)}/matters/${input.matterId}/documents/${input.documentId}/${sanitizeFileName(input.fileName)}`;
}

export function templateStoragePath(input: {
  firmId: string;
  templateId: string;
  version: number;
  fileName: string;
}): string {
  return `${firmStoragePrefix(input.firmId)}/templates/${input.templateId}/v${input.version}/${sanitizeFileName(input.fileName)}`;
}

export function hrContractStoragePath(input: {
  firmId: string;
  contractId: string;
  fileName: string;
}): string {
  return `${firmStoragePrefix(input.firmId)}/hr/contracts/${input.contractId}/${sanitizeFileName(input.fileName)}`;
}

export function assertPathBelongsToFirm(storagePath: string, firmId: string): void {
  const prefix = `${firmStoragePrefix(firmId)}/`;
  if (!storagePath.startsWith(prefix)) {
    throw new AuthError("forbidden", "Storage path firm scope mismatch.");
  }
}

export async function ensureFirmFilesBucket(): Promise<void> {
  if (!bucketReady) {
    bucketReady = (async () => {
      const admin = createAdminClient();
      const { data: buckets, error: listError } = await admin.storage.listBuckets();
      if (listError) {
        throw new Error(`Could not list storage buckets: ${listError.message}`);
      }
      const exists = buckets?.some((b) => b.name === FIRM_FILES_BUCKET);
      if (!exists) {
        const { error } = await admin.storage.createBucket(FIRM_FILES_BUCKET, {
          public: false,
          fileSizeLimit: MAX_UPLOAD_BYTES,
          allowedMimeTypes: [...ALLOWED_MIME_TYPES],
        });
        if (error && !/already exists/i.test(error.message)) {
          throw new Error(`Could not create bucket ${FIRM_FILES_BUCKET}: ${error.message}`);
        }
      }
    })().catch((err) => {
      bucketReady = null;
      throw err;
    });
  }
  await bucketReady;
}

export function validateUploadFile(file: File): void {
  if (!file || file.size <= 0) {
    throw new AuthError("validation", "A non-empty file is required.");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new AuthError("validation", "File exceeds the 25 MB upload limit.");
  }
  const mime = file.type || "application/octet-stream";
  if (!ALLOWED_MIME_TYPES.has(mime)) {
    throw new AuthError(
      "validation",
      "File type not allowed. Use PDF, DOCX, DOC, images, or plain text.",
    );
  }
}

export async function uploadFirmFile(input: {
  storagePath: string;
  firmId: string;
  bytes: Buffer | ArrayBuffer | Blob;
  contentType: string;
  upsert?: boolean;
}): Promise<void> {
  assertPathBelongsToFirm(input.storagePath, input.firmId);
  await ensureFirmFilesBucket();
  const admin = createAdminClient();
  const { error } = await admin.storage.from(FIRM_FILES_BUCKET).upload(input.storagePath, input.bytes, {
    contentType: input.contentType,
    upsert: input.upsert ?? false,
  });
  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }
}

export async function createSignedDownloadUrl(
  storagePath: string,
  firmId: string,
  expiresInSeconds = 3600,
): Promise<string> {
  assertPathBelongsToFirm(storagePath, firmId);
  await ensureFirmFilesBucket();
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(FIRM_FILES_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);
  if (error || !data?.signedUrl) {
    throw new Error(`Could not create download URL: ${error?.message ?? "unknown"}`);
  }
  return data.signedUrl;
}

export async function deleteFirmFile(storagePath: string, firmId: string): Promise<void> {
  assertPathBelongsToFirm(storagePath, firmId);
  await ensureFirmFilesBucket();
  const admin = createAdminClient();
  const { error } = await admin.storage.from(FIRM_FILES_BUCKET).remove([storagePath]);
  if (error) {
    throw new Error(`Storage delete failed: ${error.message}`);
  }
}

/**
 * Best-effort recursive remove of all objects under firms/{firmId}/.
 * Used by privacy purge (P5-11).
 */
export async function deleteFirmStoragePrefix(firmId: string): Promise<number> {
  const prefix = firmStoragePrefix(firmId);
  await ensureFirmFilesBucket();
  const admin = createAdminClient();
  let removed = 0;

  async function walk(path: string) {
    const { data, error } = await admin.storage.from(FIRM_FILES_BUCKET).list(path, {
      limit: 1000,
    });
    if (error) {
      throw new Error(`Storage list failed: ${error.message}`);
    }
    const entries = data ?? [];
    const filePaths: string[] = [];
    for (const entry of entries) {
      const full = `${path}/${entry.name}`;
      // Supabase: folders typically have id === null
      if (entry.id == null) {
        await walk(full);
      } else {
        filePaths.push(full);
      }
    }
    for (let i = 0; i < filePaths.length; i += 100) {
      const batch = filePaths.slice(i, i + 100);
      const { error: rmErr } = await admin.storage.from(FIRM_FILES_BUCKET).remove(batch);
      if (rmErr) {
        throw new Error(`Storage batch delete failed: ${rmErr.message}`);
      }
      removed += batch.length;
    }
  }

  await walk(prefix);
  return removed;
}

export async function downloadFirmFile(
  storagePath: string,
  firmId: string,
): Promise<Buffer> {
  assertPathBelongsToFirm(storagePath, firmId);
  await ensureFirmFilesBucket();
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(FIRM_FILES_BUCKET).download(storagePath);
  if (error || !data) {
    throw new Error(`Storage download failed: ${error?.message ?? "unknown"}`);
  }
  const ab = await data.arrayBuffer();
  return Buffer.from(ab);
}
