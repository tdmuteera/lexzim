/**
 * Firm event / BD / training reports (P10-13).
 * Separate from AI knowledge_sources.
 */
import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { AuthError } from "@/lib/auth/types";
import { getDb } from "@/lib/db";
import { knowledgeReports, users } from "@/lib/db/schema";
import {
  deleteFirmFile,
  knowledgeReportStoragePath,
  sanitizeFileName,
} from "@/lib/storage/firm-files";

const authorUsers = alias(users, "knowledge_report_author");
const creatorUsers = alias(users, "knowledge_report_creator");

export type KnowledgeReportRow = {
  id: string;
  firmId: string;
  title: string;
  reportDate: string;
  authorUserId: string | null;
  authorName: string | null;
  authorUserDisplayName: string | null;
  eventName: string | null;
  notes: string | null;
  fileName: string;
  contentType: string | null;
  byteSize: number | null;
  storagePath: string;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function listKnowledgeReports(firmId: string): Promise<KnowledgeReportRow[]> {
  const db = getDb();

  const rows = await db
    .select({
      id: knowledgeReports.id,
      firmId: knowledgeReports.firmId,
      title: knowledgeReports.title,
      reportDate: knowledgeReports.reportDate,
      authorUserId: knowledgeReports.authorUserId,
      authorName: knowledgeReports.authorName,
      authorUserDisplayName: authorUsers.fullName,
      eventName: knowledgeReports.eventName,
      notes: knowledgeReports.notes,
      fileName: knowledgeReports.fileName,
      contentType: knowledgeReports.contentType,
      byteSize: knowledgeReports.byteSize,
      storagePath: knowledgeReports.storagePath,
      createdBy: knowledgeReports.createdBy,
      createdByName: creatorUsers.fullName,
      createdAt: knowledgeReports.createdAt,
      updatedAt: knowledgeReports.updatedAt,
    })
    .from(knowledgeReports)
    .leftJoin(authorUsers, eq(authorUsers.id, knowledgeReports.authorUserId))
    .leftJoin(creatorUsers, eq(creatorUsers.id, knowledgeReports.createdBy))
    .where(eq(knowledgeReports.firmId, firmId))
    .orderBy(desc(knowledgeReports.reportDate), desc(knowledgeReports.createdAt));

  return rows.map((row) => ({
    ...row,
    reportDate: String(row.reportDate),
  }));
}

export async function getKnowledgeReportById(
  firmId: string,
  reportId: string,
): Promise<KnowledgeReportRow | null> {
  const db = getDb();
  const rows = await db
    .select({
      id: knowledgeReports.id,
      firmId: knowledgeReports.firmId,
      title: knowledgeReports.title,
      reportDate: knowledgeReports.reportDate,
      authorUserId: knowledgeReports.authorUserId,
      authorName: knowledgeReports.authorName,
      authorUserDisplayName: authorUsers.fullName,
      eventName: knowledgeReports.eventName,
      notes: knowledgeReports.notes,
      fileName: knowledgeReports.fileName,
      contentType: knowledgeReports.contentType,
      byteSize: knowledgeReports.byteSize,
      storagePath: knowledgeReports.storagePath,
      createdBy: knowledgeReports.createdBy,
      createdByName: creatorUsers.fullName,
      createdAt: knowledgeReports.createdAt,
      updatedAt: knowledgeReports.updatedAt,
    })
    .from(knowledgeReports)
    .leftJoin(authorUsers, eq(authorUsers.id, knowledgeReports.authorUserId))
    .leftJoin(creatorUsers, eq(creatorUsers.id, knowledgeReports.createdBy))
    .where(and(eq(knowledgeReports.firmId, firmId), eq(knowledgeReports.id, reportId)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return { ...row, reportDate: String(row.reportDate) };
}

export type CreateKnowledgeReportInput = {
  id: string;
  title: string;
  reportDate: string;
  authorUserId?: string | null;
  authorName?: string | null;
  eventName?: string | null;
  notes?: string | null;
  fileName: string;
  contentType?: string | null;
  byteSize?: number | null;
  storagePath: string;
  createdBy: string;
};

export async function createKnowledgeReport(
  firmId: string,
  input: CreateKnowledgeReportInput,
): Promise<KnowledgeReportRow> {
  const title = input.title.trim();
  if (!title) {
    throw new AuthError("validation", "Title is required.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.reportDate)) {
    throw new AuthError("validation", "Report date must be YYYY-MM-DD.");
  }

  const db = getDb();
  await db.insert(knowledgeReports).values({
    id: input.id,
    firmId,
    title,
    reportDate: input.reportDate,
    authorUserId: input.authorUserId ?? null,
    authorName: input.authorName?.trim() || null,
    eventName: input.eventName?.trim() || null,
    notes: input.notes?.trim() || null,
    fileName: sanitizeFileName(input.fileName),
    contentType: input.contentType ?? null,
    byteSize: input.byteSize ?? null,
    storagePath: input.storagePath,
    createdBy: input.createdBy,
  });

  const full = await getKnowledgeReportById(firmId, input.id);
  if (!full) {
    throw new AuthError("not_found", "Report not found after create.");
  }
  return full;
}

export async function deleteKnowledgeReport(
  firmId: string,
  reportId: string,
): Promise<boolean> {
  const existing = await getKnowledgeReportById(firmId, reportId);
  if (!existing) return false;

  const db = getDb();
  await db
    .delete(knowledgeReports)
    .where(and(eq(knowledgeReports.firmId, firmId), eq(knowledgeReports.id, reportId)));

  try {
    await deleteFirmFile(existing.storagePath, firmId);
  } catch {
    /* best-effort storage cleanup */
  }
  return true;
}

export function serializeKnowledgeReport(row: KnowledgeReportRow) {
  const authorDisplay =
    row.authorUserDisplayName?.trim() || row.authorName?.trim() || null;
  return {
    id: row.id,
    title: row.title,
    reportDate: row.reportDate,
    authorUserId: row.authorUserId,
    authorName: row.authorName,
    authorDisplay,
    eventName: row.eventName,
    notes: row.notes,
    fileName: row.fileName,
    contentType: row.contentType,
    byteSize: row.byteSize,
    createdBy: row.createdBy,
    createdByName: row.createdByName,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export { knowledgeReportStoragePath };
