/**
 * Templates repository (P1-08).
 */
import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/lib/db";
import { templateVersions, templates, users } from "@/lib/db/schema";
import type { TemplateMetaInput } from "@/lib/templates/validation";

const createdByUsers = alias(users, "template_created_by_users");
const approvedByUsers = alias(users, "template_approved_by_users");

export type TemplateListRow = typeof templates.$inferSelect & {
  createdByName: string | null;
  approvedByName: string | null;
};

export async function listTemplates(
  firmId: string,
  opts?: {
    areaOfLaw?: string;
    activeOnly?: boolean;
    q?: string;
    approvedOnly?: boolean;
  },
): Promise<TemplateListRow[]> {
  const db = getDb();
  const conditions = [eq(templates.firmId, firmId)];
  if (opts?.areaOfLaw) conditions.push(eq(templates.areaOfLaw, opts.areaOfLaw));
  if (opts?.activeOnly) conditions.push(eq(templates.isActive, true));
  if (opts?.approvedOnly) {
    conditions.push(sql`${templates.approvedAt} is not null`);
  }
  if (opts?.q?.trim()) {
    const pattern = `%${opts.q.trim()}%`;
    conditions.push(
      or(ilike(templates.title, pattern), ilike(templates.description, pattern))!,
    );
  }

  const rows = await db
    .select({
      template: templates,
      createdByName: createdByUsers.fullName,
      approvedByName: approvedByUsers.fullName,
    })
    .from(templates)
    .leftJoin(createdByUsers, eq(createdByUsers.id, templates.createdBy))
    .leftJoin(approvedByUsers, eq(approvedByUsers.id, templates.approvedBy))
    .where(and(...conditions))
    .orderBy(asc(templates.areaOfLaw), asc(templates.title));

  return rows.map((row) => ({
    ...row.template,
    createdByName: row.createdByName ?? null,
    approvedByName: row.approvedByName ?? null,
  }));
}

export async function getTemplateById(firmId: string, templateId: string) {
  const db = getDb();
  const rows = await db
    .select({
      template: templates,
      createdByName: createdByUsers.fullName,
      approvedByName: approvedByUsers.fullName,
    })
    .from(templates)
    .leftJoin(createdByUsers, eq(createdByUsers.id, templates.createdBy))
    .leftJoin(approvedByUsers, eq(approvedByUsers.id, templates.approvedBy))
    .where(and(eq(templates.firmId, firmId), eq(templates.id, templateId)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return {
    ...row.template,
    createdByName: row.createdByName ?? null,
    approvedByName: row.approvedByName ?? null,
  };
}

export async function listTemplateVersions(firmId: string, templateId: string) {
  const db = getDb();
  return db
    .select()
    .from(templateVersions)
    .where(and(eq(templateVersions.firmId, firmId), eq(templateVersions.templateId, templateId)))
    .orderBy(asc(templateVersions.version));
}

export async function createTemplateRecord(input: {
  id: string;
  firmId: string;
  title: string;
  areaOfLaw: string;
  description?: string | null;
  storagePath: string;
  version?: number;
  createdBy: string;
  bodyFormat?: string;
}) {
  const db = getDb();
  const version = input.version ?? 1;
  const rows = await db
    .insert(templates)
    .values({
      id: input.id,
      firmId: input.firmId,
      title: input.title,
      areaOfLaw: input.areaOfLaw,
      description: input.description ?? null,
      bodyFormat: input.bodyFormat ?? "docx",
      storagePath: input.storagePath,
      version,
      isActive: true,
      createdBy: input.createdBy,
    })
    .returning();

  await db.insert(templateVersions).values({
    firmId: input.firmId,
    templateId: rows[0].id,
    version,
    storagePath: input.storagePath,
    changeNote: "Initial version",
    createdBy: input.createdBy,
  });

  return rows[0];
}

export async function updateTemplateMeta(
  firmId: string,
  templateId: string,
  input: TemplateMetaInput,
) {
  const db = getDb();
  const rows = await db
    .update(templates)
    .set({
      title: input.title,
      areaOfLaw: input.areaOfLaw,
      description: input.description ?? null,
      isActive: input.isActive ?? true,
      updatedAt: new Date(),
    })
    .where(and(eq(templates.firmId, firmId), eq(templates.id, templateId)))
    .returning();
  return rows[0] ?? null;
}

export async function approveTemplate(
  firmId: string,
  templateId: string,
  approverId: string,
) {
  const db = getDb();
  const now = new Date();
  const rows = await db
    .update(templates)
    .set({
      approvedBy: approverId,
      approvedAt: now,
      updatedAt: now,
    })
    .where(and(eq(templates.firmId, firmId), eq(templates.id, templateId)))
    .returning();

  const template = rows[0];
  if (!template) return null;

  await db
    .update(templateVersions)
    .set({ approvedBy: approverId, updatedAt: now })
    .where(
      and(
        eq(templateVersions.firmId, firmId),
        eq(templateVersions.templateId, templateId),
        eq(templateVersions.version, template.version),
      ),
    );

  return template;
}

export async function findTemplateByTitle(firmId: string, title: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(templates)
    .where(and(eq(templates.firmId, firmId), eq(templates.title, title)))
    .limit(1);
  return rows[0] ?? null;
}
