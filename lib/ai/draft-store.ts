import "server-only";

import {
  downloadFirmFile,
  sanitizeFileName,
  uploadFirmFile,
} from "@/lib/storage/firm-files";
import { firmStoragePrefix } from "@/lib/tenant/scope";

type DraftRow = {
  firmId: string;
  userId: string;
  fileName: string;
  bytes: Buffer;
  storagePath: string;
  createdAt: number;
};

const drafts = new Map<string, DraftRow>();
const TTL_MS = 24 * 60 * 60 * 1000; // 24h in memory cache; storage is source of truth

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function prune() {
  const now = Date.now();
  for (const [id, row] of drafts) {
    if (now - row.createdAt > TTL_MS) drafts.delete(id);
  }
}

/** Stable storage path so any Railway instance can serve the download. */
export function aiDraftStoragePath(input: {
  firmId: string;
  userId: string;
  draftId: string;
  fileName: string;
}): string {
  const safe = sanitizeFileName(input.fileName).replace(/\.docx$/i, "") || "document";
  return `${firmStoragePrefix(input.firmId)}/ai-drafts/${input.userId}/${input.draftId}/${safe}.docx`;
}

/** ASCII-safe Content-Disposition filename (Edge/Windows choke on ellipsis etc.). */
export function contentDispositionAttachment(fileName: string): string {
  const raw = (fileName || "document.docx").trim() || "document.docx";
  const withExt = /\.docx$/i.test(raw) ? raw : `${raw}.docx`;
  const ascii = withExt
    .replace(/[.…⋯・]+/g, "")
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/["\\]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "document.docx";
  const encoded = encodeURIComponent(withExt);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export async function putAiDraft(input: {
  firmId: string;
  userId: string;
  fileName: string;
  bytes: Buffer;
}): Promise<{ id: string; fileName: string }> {
  prune();
  const id = crypto.randomUUID();
  const fileName = sanitizeFileName(input.fileName);
  const storagePath = aiDraftStoragePath({
    firmId: input.firmId,
    userId: input.userId,
    draftId: id,
    fileName,
  });

  await uploadFirmFile({
    firmId: input.firmId,
    storagePath,
    bytes: input.bytes,
    contentType: DOCX_MIME,
    upsert: true,
  });

  drafts.set(id, {
    firmId: input.firmId,
    userId: input.userId,
    fileName,
    bytes: input.bytes,
    storagePath,
    createdAt: Date.now(),
  });

  return { id, fileName };
}

export async function getAiDraft(
  id: string,
  firmId: string,
  userId: string,
): Promise<{ fileName: string; bytes: Buffer } | null> {
  prune();
  const cached = drafts.get(id);
  if (cached) {
    if (cached.firmId !== firmId || cached.userId !== userId) return null;
    return { fileName: cached.fileName, bytes: cached.bytes };
  }

  // Any instance: recover from durable storage (path is deterministic).
  // Try common sanitized names; list is unnecessary if we store as *.docx under draft id.
  const candidates = [
    aiDraftStoragePath({ firmId, userId, draftId: id, fileName: "document.docx" }),
  ];

  // Prefer listing the draft folder so we keep the original display name.
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const { FIRM_FILES_BUCKET, ensureFirmFilesBucket } = await import(
      "@/lib/storage/firm-files"
    );
    await ensureFirmFilesBucket();
    const admin = createAdminClient();
    const folder = `${firmStoragePrefix(firmId)}/ai-drafts/${userId}/${id}`;
    const { data: entries } = await admin.storage.from(FIRM_FILES_BUCKET).list(folder, {
      limit: 5,
    });
    const file = (entries ?? []).find((e) => e.id != null && /\.docx$/i.test(e.name));
    if (file) {
      const storagePath = `${folder}/${file.name}`;
      const bytes = await downloadFirmFile(storagePath, firmId);
      const fileName = file.name;
      drafts.set(id, {
        firmId,
        userId,
        fileName,
        bytes,
        storagePath,
        createdAt: Date.now(),
      });
      return { fileName, bytes };
    }
  } catch {
    /* fall through to candidate paths */
  }

  for (const storagePath of candidates) {
    try {
      const bytes = await downloadFirmFile(storagePath, firmId);
      const fileName = storagePath.split("/").pop() || "document.docx";
      drafts.set(id, {
        firmId,
        userId,
        fileName,
        bytes,
        storagePath,
        createdAt: Date.now(),
      });
      return { fileName, bytes };
    } catch {
      /* try next */
    }
  }

  return null;
}
