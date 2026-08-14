import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { AuthError } from "@/lib/auth/types";
import { getDb } from "@/lib/db";
import { glAccounts } from "@/lib/db/schema";
import { DEFAULT_COA } from "@/lib/gl/coa-seed";
import type { GlAccountType, GlNormalBalance } from "@/lib/gl/types";

type GlAccountRow = typeof glAccounts.$inferSelect;

export async function countGlAccounts(firmId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ id: glAccounts.id })
    .from(glAccounts)
    .where(eq(glAccounts.firmId, firmId))
    .limit(1);
  return rows.length;
}

/** Seed default COA when firm has none (first visit or firm create hook). */
export async function seedDefaultCoa(firmId: string): Promise<number> {
  const existing = await countGlAccounts(firmId);
  if (existing > 0) return 0;

  const db = getDb();
  const codeToId = new Map<string, string>();

  for (const row of DEFAULT_COA) {
    const parentId = row.parentCode ? codeToId.get(row.parentCode) ?? null : null;
    const inserted = await db
      .insert(glAccounts)
      .values({
        firmId,
        code: row.code,
        name: row.name,
        type: row.type,
        parentId,
        isActive: true,
        isSystem: row.isSystem ?? false,
        normalBalance: row.normalBalance,
        description: row.description ?? null,
      })
      .returning();
    codeToId.set(row.code, inserted[0]!.id);
  }

  return DEFAULT_COA.length;
}

export async function ensureCoaSeeded(firmId: string) {
  await seedDefaultCoa(firmId);
}

export async function listGlAccounts(firmId: string, opts?: { activeOnly?: boolean }) {
  await ensureCoaSeeded(firmId);
  const db = getDb();
  const conditions = [eq(glAccounts.firmId, firmId)];
  if (opts?.activeOnly) {
    conditions.push(eq(glAccounts.isActive, true));
  }
  return db
    .select()
    .from(glAccounts)
    .where(and(...conditions))
    .orderBy(asc(glAccounts.code));
}

export async function getGlAccount(firmId: string, accountId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(glAccounts)
    .where(and(eq(glAccounts.firmId, firmId), eq(glAccounts.id, accountId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getGlAccountByCode(firmId: string, code: string) {
  await ensureCoaSeeded(firmId);
  const db = getDb();
  const rows = await db
    .select()
    .from(glAccounts)
    .where(and(eq(glAccounts.firmId, firmId), eq(glAccounts.code, code)))
    .limit(1);
  return rows[0] ?? null;
}

/** Insert a single seed row when upgrading firms that predate a new system account. */
export async function ensureGlAccountByCode(
  firmId: string,
  code: string,
): Promise<GlAccountRow> {
  const existing = await getGlAccountByCode(firmId, code);
  if (existing) return existing;

  const row = DEFAULT_COA.find((a) => a.code === code);
  if (!row) {
    throw new AuthError("validation", `Unknown COA seed code ${code}.`);
  }

  let parentId: string | null = null;
  if (row.parentCode) {
    const parent: GlAccountRow = await ensureGlAccountByCode(firmId, row.parentCode);
    parentId = parent.id;
  }

  const db = getDb();
  const inserted: GlAccountRow[] = await db
    .insert(glAccounts)
    .values({
      firmId,
      code: row.code,
      name: row.name,
      type: row.type,
      parentId,
      isActive: true,
      isSystem: row.isSystem ?? false,
      normalBalance: row.normalBalance,
      description: row.description ?? null,
    })
    .returning();
  return inserted[0]!;
}

export async function createGlAccount(
  firmId: string,
  input: {
    code: string;
    name: string;
    type: GlAccountType;
    parentId?: string | null;
    normalBalance: GlNormalBalance;
    description?: string | null;
  },
) {
  const code = input.code.trim();
  if (!/^\d{4}$/.test(code)) {
    throw new AuthError("validation", "Account code must be a 4-digit number.");
  }
  const db = getDb();
  try {
    const rows = await db
      .insert(glAccounts)
      .values({
        firmId,
        code,
        name: input.name.trim(),
        type: input.type,
        parentId: input.parentId ?? null,
        isActive: true,
        isSystem: false,
        normalBalance: input.normalBalance,
        description: input.description?.trim() || null,
      })
      .returning();
    return rows[0]!;
  } catch (err) {
    if (err instanceof Error && err.message.includes("gl_accounts_firm_code_uid")) {
      throw new AuthError("validation", `Account code ${code} already exists.`);
    }
    throw err;
  }
}

export async function updateGlAccount(
  firmId: string,
  accountId: string,
  input: {
    name?: string;
    description?: string | null;
    isActive?: boolean;
    parentId?: string | null;
  },
) {
  const account = await getGlAccount(firmId, accountId);
  if (!account) {
    throw new AuthError("not_found", "Account not found.");
  }

  const db = getDb();
  const rows = await db
    .update(glAccounts)
    .set({
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(glAccounts.firmId, firmId), eq(glAccounts.id, accountId)))
    .returning();
  return rows[0]!;
}

export async function disableGlAccount(firmId: string, accountId: string) {
  const account = await getGlAccount(firmId, accountId);
  if (!account) {
    throw new AuthError("not_found", "Account not found.");
  }
  if (account.isSystem) {
    throw new AuthError("validation", "System accounts cannot be disabled.");
  }
  return updateGlAccount(firmId, accountId, { isActive: false });
}
