import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { firmSettings } from "@/lib/db/schema";

export const LAST_EXPORT_AT_KEY = "last_export_at";

/** Phase 3 billing / ops keys (P3-01). Values are plain text in firm_settings. */
export const DEFAULT_CURRENCY_KEY = "default_currency";
export const INVOICE_PREFIX_KEY = "invoice_prefix";
export const NEXT_INVOICE_NUMBER_KEY = "next_invoice_number";
export const INVOICE_DUE_DAYS_KEY = "invoice_due_days";
/** P3-04: firm allows in-browser Notification API while app is open (no push/SMTP). */
export const BROWSER_NOTIFICATIONS_KEY = "browser_notifications_enabled";

/** P4-10: post-setup onboarding (dismissible; never blocks the app). */
export const ONBOARDING_DISMISSED_AT_KEY = "onboarding_dismissed_at";
export const ONBOARDING_EXPORT_ACK_KEY = "onboarding_export_acknowledged_at";
export const ONBOARDING_PROFILE_CONFIRMED_AT_KEY = "onboarding_profile_confirmed_at";
export const ONBOARDING_DEMO_SEEDED_AT_KEY = "onboarding_demo_seeded_at";

export const PHASE3_FIRM_SETTING_KEYS = [
  DEFAULT_CURRENCY_KEY,
  INVOICE_PREFIX_KEY,
  NEXT_INVOICE_NUMBER_KEY,
  INVOICE_DUE_DAYS_KEY,
  BROWSER_NOTIFICATIONS_KEY,
] as const;

const SENSITIVE_KEY_RE =
  /(api[_-]?key|secret|token|password|private[_-]?key|credential|byo|_key$)/i;

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

export async function deleteFirmSetting(firmId: string, key: string): Promise<void> {
  const db = getDb();
  await db
    .delete(firmSettings)
    .where(and(eq(firmSettings.firmId, firmId), eq(firmSettings.key, key)));
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

/** Allocate next fee-note number (prefix + sequence). Atomic via row lock. */
export async function allocateInvoiceNumber(firmId: string): Promise<string> {
  const db = getDb();
  const prefixExisting = await getFirmSetting(firmId, INVOICE_PREFIX_KEY);
  const prefix = prefixExisting || "INV";
  if (!prefixExisting) {
    await upsertFirmSetting(firmId, INVOICE_PREFIX_KEY, prefix);
  }

  return db.transaction(async (tx) => {
    await tx
      .insert(firmSettings)
      .values({
        firmId,
        key: NEXT_INVOICE_NUMBER_KEY,
        value: "1",
        updatedAt: new Date(),
      })
      .onConflictDoNothing({
        target: [firmSettings.firmId, firmSettings.key],
      });

    const locked = await tx.execute<{ value: string }>(sql`
      select value
      from firm_settings
      where firm_id = ${firmId}
        and key = ${NEXT_INVOICE_NUMBER_KEY}
      for update
    `);

    const lockedRows =
      (locked as unknown as { rows?: Array<{ value: string }> }).rows ??
      (Array.isArray(locked) ? (locked as Array<{ value: string }>) : []);
    let next = Number(lockedRows[0]?.value ?? "1");
    if (!Number.isInteger(next) || next < 1) next = 1;

    await tx
      .update(firmSettings)
      .set({ value: String(next + 1), updatedAt: new Date() })
      .where(
        and(
          eq(firmSettings.firmId, firmId),
          eq(firmSettings.key, NEXT_INVOICE_NUMBER_KEY),
        ),
      );

    return `${prefix}-${String(next).padStart(4, "0")}`;
  });
}

export async function getInvoiceDueDays(firmId: string): Promise<number> {
  const raw = await getFirmSetting(firmId, INVOICE_DUE_DAYS_KEY);
  const n = raw ? Number(raw) : 14;
  if (!Number.isInteger(n) || n < 0 || n > 365) return 14;
  return n;
}
