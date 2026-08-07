import "server-only";

import { getDb } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";

type WriteAuditInput = {
  action: string;
  firmId?: string | null;
  userId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  ipOrUserAgent?: string | null;
};

/**
 * Append an audit row. Never pass passwords or raw tokens in metadata.
 */
export async function writeAuditLog(input: WriteAuditInput): Promise<void> {
  const db = getDb();
  await db.insert(auditLogs).values({
    firmId: input.firmId ?? null,
    userId: input.userId ?? null,
    action: input.action,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    metadataJson: input.metadata ?? {},
    ipOrUserAgent: input.ipOrUserAgent ?? null,
  });
}
