/**
 * Portal upload inbox (quarantine). Files are not matter documents until accepted.
 */
import "server-only";

import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { AuthError } from "@/lib/auth/types";
import { getDb } from "@/lib/db";
import { matters, portalInboxUploads } from "@/lib/db/schema";
import { createStaffNotification } from "@/lib/notifications/staff";
import { createDocumentRecord } from "@/lib/repos/documents";
import { portalCanUploadToMatter } from "@/lib/portal/shares";
import {
  sanitizeFileName,
  uploadFirmFile,
  validateUploadFile,
} from "@/lib/storage/firm-files";
import { firmStoragePrefix } from "@/lib/tenant/scope";

export function portalInboxStoragePath(input: {
  firmId: string;
  matterId: string;
  uploadId: string;
  fileName: string;
}): string {
  return `${firmStoragePrefix(input.firmId)}/matters/${input.matterId}/portal-inbox/${input.uploadId}/${sanitizeFileName(input.fileName)}`;
}

export async function createPortalInboxUpload(input: {
  firmId: string;
  clientId: string;
  matterId: string;
  portalUserId: string;
  file: File;
  title?: string | null;
}) {
  const allowed = await portalCanUploadToMatter(
    input.firmId,
    input.clientId,
    input.matterId,
  );
  if (!allowed) {
    throw new AuthError(
      "forbidden",
      "Uploads are not enabled for this matter. Ask your firm to allow portal uploads.",
    );
  }

  const db = getDb();
  const matterRows = await db
    .select({
      id: matters.id,
      title: matters.title,
      clientId: matters.clientId,
    })
    .from(matters)
    .where(and(eq(matters.id, input.matterId), eq(matters.firmId, input.firmId)))
    .limit(1);
  const matter = matterRows[0];
  if (!matter || matter.clientId !== input.clientId) {
    throw new AuthError("not_found", "Matter not found.");
  }

  validateUploadFile(input.file);

  const uploadId = randomUUID();
  const fileName = sanitizeFileName(input.file.name);
  const mimeType = input.file.type || "application/octet-stream";
  const title =
    input.title?.trim() ||
    input.file.name.replace(/\.[^.]+$/, "") ||
    input.file.name;
  const storagePath = portalInboxStoragePath({
    firmId: input.firmId,
    matterId: input.matterId,
    uploadId,
    fileName,
  });

  const bytes = Buffer.from(await input.file.arrayBuffer());
  await uploadFirmFile({
    storagePath,
    firmId: input.firmId,
    bytes,
    contentType: mimeType,
  });

  const rows = await db
    .insert(portalInboxUploads)
    .values({
      id: uploadId,
      firmId: input.firmId,
      clientId: input.clientId,
      matterId: input.matterId,
      portalUserId: input.portalUserId,
      title,
      fileName,
      mimeType,
      storagePath,
      sizeBytes: input.file.size,
      status: "pending",
    })
    .returning();

  const row = rows[0];
  await createStaffNotification({
    firmId: input.firmId,
    type: "portal_inbox_upload",
    title: "Client portal upload",
    body: `${title} on ${matter.title}`,
    href: `/matters/${input.matterId}`,
    metadata: {
      matterId: input.matterId,
      uploadId: row.id,
      clientId: input.clientId,
    },
  });

  return row;
}

export async function listPortalInboxForMatter(
  firmId: string,
  matterId: string,
  opts?: { status?: string },
) {
  const db = getDb();
  const conditions = [
    eq(portalInboxUploads.firmId, firmId),
    eq(portalInboxUploads.matterId, matterId),
  ];
  if (opts?.status) {
    conditions.push(eq(portalInboxUploads.status, opts.status));
  }
  return db
    .select()
    .from(portalInboxUploads)
    .where(and(...conditions))
    .orderBy(desc(portalInboxUploads.createdAt));
}

export async function acceptPortalInboxUpload(input: {
  firmId: string;
  uploadId: string;
  reviewedByUserId: string;
}) {
  const db = getDb();
  const rows = await db
    .select()
    .from(portalInboxUploads)
    .where(
      and(
        eq(portalInboxUploads.id, input.uploadId),
        eq(portalInboxUploads.firmId, input.firmId),
      ),
    )
    .limit(1);
  const upload = rows[0];
  if (!upload) throw new AuthError("not_found", "Inbox item not found.");
  if (upload.status !== "pending") {
    throw new AuthError("validation", "Only pending uploads can be accepted.");
  }

  const documentId = randomUUID();
  await createDocumentRecord({
    id: documentId,
    firmId: upload.firmId,
    matterId: upload.matterId,
    clientId: upload.clientId,
    title: upload.title,
    fileName: upload.fileName,
    mimeType: upload.mimeType,
    storagePath: upload.storagePath,
    sizeBytes: upload.sizeBytes ?? 0,
    docType: "portal_accepted",
    createdBy: input.reviewedByUserId,
  });

  const updated = await db
    .update(portalInboxUploads)
    .set({
      status: "accepted",
      acceptedDocumentId: documentId,
      reviewedByUserId: input.reviewedByUserId,
      reviewedAt: new Date(),
    })
    .where(eq(portalInboxUploads.id, upload.id))
    .returning();

  return { upload: updated[0], documentId };
}

export async function dismissPortalInboxUpload(input: {
  firmId: string;
  uploadId: string;
  reviewedByUserId: string;
}) {
  const db = getDb();
  const rows = await db
    .update(portalInboxUploads)
    .set({
      status: "dismissed",
      reviewedByUserId: input.reviewedByUserId,
      reviewedAt: new Date(),
    })
    .where(
      and(
        eq(portalInboxUploads.id, input.uploadId),
        eq(portalInboxUploads.firmId, input.firmId),
        eq(portalInboxUploads.status, "pending"),
      ),
    )
    .returning();
  if (!rows[0]) {
    throw new AuthError("not_found", "Pending inbox item not found.");
  }
  return rows[0];
}
