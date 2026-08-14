import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { AuthError } from "@/lib/auth/types";
import { getDb } from "@/lib/db";
import { firmServices, glAccounts } from "@/lib/db/schema";
import { ensureCoaSeeded } from "@/lib/gl/accounts";
import { DEFAULT_FIRM_SERVICES } from "@/lib/quotes/service-seed";

export async function countFirmServices(firmId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ id: firmServices.id })
    .from(firmServices)
    .where(eq(firmServices.firmId, firmId))
    .limit(1);
  return rows.length;
}

export async function seedDefaultFirmServices(firmId: string, currency = "USD"): Promise<number> {
  if ((await countFirmServices(firmId)) > 0) return 0;
  await ensureCoaSeeded(firmId);
  const db = getDb();

  const accounts = await db
    .select({ id: glAccounts.id, code: glAccounts.code })
    .from(glAccounts)
    .where(eq(glAccounts.firmId, firmId));
  const byCode = new Map(accounts.map((a) => [a.code, a.id]));

  for (const row of DEFAULT_FIRM_SERVICES) {
    await db.insert(firmServices).values({
      firmId,
      code: row.code,
      name: row.name,
      description: row.description ?? null,
      defaultPriceCents: row.defaultPriceCents,
      currency,
      revenueGlAccountId: byCode.get(row.revenueGlCode) ?? null,
      isActive: true,
      sortOrder: row.sortOrder,
    });
  }

  return DEFAULT_FIRM_SERVICES.length;
}

export async function ensureFirmServicesSeeded(firmId: string, currency = "USD") {
  await seedDefaultFirmServices(firmId, currency);
}

export async function listFirmServices(firmId: string, opts?: { activeOnly?: boolean }) {
  await ensureFirmServicesSeeded(firmId);
  const db = getDb();
  const conditions = [eq(firmServices.firmId, firmId)];
  if (opts?.activeOnly) conditions.push(eq(firmServices.isActive, true));

  return db
    .select({
      service: firmServices,
      glCode: glAccounts.code,
      glName: glAccounts.name,
    })
    .from(firmServices)
    .leftJoin(glAccounts, eq(glAccounts.id, firmServices.revenueGlAccountId))
    .where(and(...conditions))
    .orderBy(asc(firmServices.sortOrder), asc(firmServices.name));
}

export async function getFirmService(firmId: string, serviceId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(firmServices)
    .where(and(eq(firmServices.firmId, firmId), eq(firmServices.id, serviceId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateFirmService(
  firmId: string,
  serviceId: string,
  input: {
    name?: string;
    description?: string | null;
    defaultPriceCents?: number;
    isActive?: boolean;
    sortOrder?: number;
  },
) {
  const existing = await getFirmService(firmId, serviceId);
  if (!existing) throw new AuthError("not_found", "Service not found.");

  const db = getDb();
  const rows = await db
    .update(firmServices)
    .set({
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
      ...(input.defaultPriceCents !== undefined ? { defaultPriceCents: input.defaultPriceCents } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(firmServices.firmId, firmId), eq(firmServices.id, serviceId)))
    .returning();
  return rows[0]!;
}
