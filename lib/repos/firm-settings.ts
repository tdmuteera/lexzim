import "server-only";

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { firmSettings } from "@/lib/db/schema";

export const LAST_EXPORT_AT_KEY = "last_export_at";

/** Phase 3 billing / ops keys (P3-01). Values are plain text in firm_settings. */
export const DEFAULT_CURRENCY_KEY = "default_currency";
export const INVOICE_PREFIX_KEY = "invoice_prefix";
export const NEXT_INVOICE_NUMBER_KEY = "next_invoice_number";
export const INVOICE_DUE_DAYS_KEY = "invoice_due_days";

export const PHASE3_FIRM_SETTING_KEYS = [
  DEFAULT_CURRENCY_KEY,
  INVOICE_PREFIX_KEY,
  NEXT_INVOICE_NUMBER_KEY,
  INVOICE_DUE_DAYS_KEY,
] as const;

const SENSITIVE_KEY_RE = /(api[_-]?key|secret|token|password|private[_-]?key|credential)/i;

export function isSensitiveSettingKey(key: string): boolean {
  return SENSITIVE_KEY_RE.test(key);
}

export async function getFirmSetting(
  firmId: string,
  key: string,
): Promise<string | null> {
  const db = getDb();
  const rows = await db
    .select({ value: firmSettings.value })
    .from(firmSettings)
    .where(and(eq(firmSettings.firmId, firmId), eq(firmSettings.key, key)))
    .limit(1);
  return rows[0]?.value ?? null;
}

export async function upsertFirmSetting(
  firmId: string,
  key: string,
  value: string,
): Promise<void> {
  const db = getDb();
  await db
    .insert(firmSettings)
    .values({
      firmId,
      key,
      value,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [firmSettings.firmId, firmSettings.key],
      set: { value, updatedAt: new Date() },
    });
}

export async function listFirmSettingsForExport(
  firmId: string,
): Promise<Array<{ key: string; value: string; updatedAt: Date }>> {
  const db = getDb();
  const rows = await db
    .select({
      key: firmSettings.key,
      value: firmSettings.value,
      updatedAt: firmSettings.updatedAt,
    })
    .from(firmSettings)
    .where(eq(firmSettings.firmId, firmId));

  return rows.filter((row) => !isSensitiveSettingKey(row.key));
}
