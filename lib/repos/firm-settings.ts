import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { firmSettings, hrStaffProfiles, matters } from "@/lib/db/schema";

export const LAST_EXPORT_AT_KEY = "last_export_at";

/** Phase 3 billing / ops keys (P3-01). Values are plain text in firm_settings. */
export const DEFAULT_CURRENCY_KEY = "default_currency";
export const INVOICE_PREFIX_KEY = "invoice_prefix";
export const NEXT_INVOICE_NUMBER_KEY = "next_invoice_number";
export const INVOICE_DUE_DAYS_KEY = "invoice_due_days";
export const RECEIPT_PREFIX_KEY = "receipt_prefix";
export const NEXT_RECEIPT_NUMBER_KEY = "next_receipt_number";
/** Phase 11: one cash-event number for Finance → Payments intakes (PAY-0001). */
export const PAYMENT_INTAKE_PREFIX_KEY = "payment_intake_prefix";
export const NEXT_PAYMENT_INTAKE_NUMBER_KEY = "next_payment_intake_number";
export const TRUST_REF_PREFIX_KEY = "trust_ref_prefix";
export const NEXT_TRUST_REF_NUMBER_KEY = "next_trust_ref_number";
export const MATTER_PREFIX_KEY = "matter_prefix";
export const NEXT_MATTER_NUMBER_KEY = "next_matter_number";
/** HR: EMP-0001 style employee numbers per firm. */
export const EMPLOYEE_PREFIX_KEY = "employee_prefix";
export const NEXT_EMPLOYEE_NUMBER_KEY = "next_employee_number";
/** P3-04: firm allows in-browser Notification API while app is open (no push/SMTP). */
export const BROWSER_NOTIFICATIONS_KEY = "browser_notifications_enabled";

/** P4-10: post-setup onboarding (dismissible; never blocks the app). */
export const ONBOARDING_DISMISSED_AT_KEY = "onboarding_dismissed_at";
export const ONBOARDING_EXPORT_ACK_KEY = "onboarding_export_acknowledged_at";
export const ONBOARDING_PROFILE_CONFIRMED_AT_KEY = "onboarding_profile_confirmed_at";
export const ONBOARDING_DEMO_SEEDED_AT_KEY = "onboarding_demo_seeded_at";

/** Per-firm invoice letterhead (T Pfigu-style PDF). */
export const INVOICE_ATTORNEY_LINE_KEY = "invoice_attorney_line";
export const INVOICE_PAYMENT_NOTE_KEY = "invoice_payment_note";
export const INVOICE_CLOSING_NOTE_KEY = "invoice_closing_note";
/** JSON: accountName, bank, accountNumber, branch, accountType, swiftCode, branchCode */
export const INVOICE_BANKING_KEY = "invoice_banking";
/** Phase 10: when not "false", draft invoices must be approved before Mark sent. Default ON. */
export const REQUIRE_INVOICE_APPROVAL_KEY = "require_invoice_approval";
/** Phase 11: when "true", block firm-float disbursement pay if trust is short. Default OFF. */
export const BLOCK_DISBURSEMENT_IF_TRUST_SHORT_KEY =
  "block_disbursement_if_trust_short";
/** Phase 10: when not "false", matter status open requires latest client conflict = clear. Default ON. */
export const REQUIRE_CLEAR_CONFLICT_KEY = "require_clear_conflict";

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

/** Allocate next fee receipt number (RCP-0001 per firm). */
export async function allocateReceiptNumber(firmId: string): Promise<string> {
  const db = getDb();
  const prefixExisting = await getFirmSetting(firmId, RECEIPT_PREFIX_KEY);
  const prefix = prefixExisting || "RCP";
  if (!prefixExisting) {
    await upsertFirmSetting(firmId, RECEIPT_PREFIX_KEY, prefix);
  }

  return db.transaction(async (tx) => {
    await tx
      .insert(firmSettings)
      .values({
        firmId,
        key: NEXT_RECEIPT_NUMBER_KEY,
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
        and key = ${NEXT_RECEIPT_NUMBER_KEY}
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
          eq(firmSettings.key, NEXT_RECEIPT_NUMBER_KEY),
        ),
      );

    return `${prefix}-${String(next).padStart(4, "0")}`;
  });
}

/** Allocate next Payments intake cash-receipt number (PAY-0001). One number per cash event. */
export async function allocatePaymentIntakeReceiptNumber(firmId: string): Promise<string> {
  const db = getDb();
  const prefixExisting = await getFirmSetting(firmId, PAYMENT_INTAKE_PREFIX_KEY);
  const prefix = prefixExisting || "PAY";
  if (!prefixExisting) {
    await upsertFirmSetting(firmId, PAYMENT_INTAKE_PREFIX_KEY, prefix);
  }

  return db.transaction(async (tx) => {
    await tx
      .insert(firmSettings)
      .values({
        firmId,
        key: NEXT_PAYMENT_INTAKE_NUMBER_KEY,
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
        and key = ${NEXT_PAYMENT_INTAKE_NUMBER_KEY}
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
          eq(firmSettings.key, NEXT_PAYMENT_INTAKE_NUMBER_KEY),
        ),
      );

    return `${prefix}-${String(next).padStart(4, "0")}`;
  });
}

/** Allocate next matter number (MAT-0001 per firm). Skips numbers already in use. */
export async function allocateMatterNumber(firmId: string): Promise<string> {
  const db = getDb();
  const prefixExisting = await getFirmSetting(firmId, MATTER_PREFIX_KEY);
  const prefix = prefixExisting || "MAT";
  if (!prefixExisting) {
    await upsertFirmSetting(firmId, MATTER_PREFIX_KEY, prefix);
  }

  return db.transaction(async (tx) => {
    await tx
      .insert(firmSettings)
      .values({
        firmId,
        key: NEXT_MATTER_NUMBER_KEY,
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
        and key = ${NEXT_MATTER_NUMBER_KEY}
      for update
    `);

    const lockedRows =
      (locked as unknown as { rows?: Array<{ value: string }> }).rows ??
      (Array.isArray(locked) ? (locked as Array<{ value: string }>) : []);
    let next = Number(lockedRows[0]?.value ?? "1");
    if (!Number.isInteger(next) || next < 1) next = 1;

    let candidate = `${prefix}-${String(next).padStart(4, "0")}`;
    for (let guard = 0; guard < 500; guard += 1) {
      const existing = await tx
        .select({ id: matters.id })
        .from(matters)
        .where(and(eq(matters.firmId, firmId), eq(matters.matterNumber, candidate)))
        .limit(1);
      if (!existing[0]) break;
      next += 1;
      candidate = `${prefix}-${String(next).padStart(4, "0")}`;
    }

    await tx
      .update(firmSettings)
      .set({ value: String(next + 1), updatedAt: new Date() })
      .where(
        and(
          eq(firmSettings.firmId, firmId),
          eq(firmSettings.key, NEXT_MATTER_NUMBER_KEY),
        ),
      );

    return candidate;
  });
}

/** Allocate next employee number (EMP-0001 per firm). Skips numbers already in use. */
export async function allocateEmployeeNumber(firmId: string): Promise<string> {
  const db = getDb();
  const prefixExisting = await getFirmSetting(firmId, EMPLOYEE_PREFIX_KEY);
  const prefix = prefixExisting || "EMP";
  if (!prefixExisting) {
    await upsertFirmSetting(firmId, EMPLOYEE_PREFIX_KEY, prefix);
  }

  return db.transaction(async (tx) => {
    await tx
      .insert(firmSettings)
      .values({
        firmId,
        key: NEXT_EMPLOYEE_NUMBER_KEY,
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
        and key = ${NEXT_EMPLOYEE_NUMBER_KEY}
      for update
    `);

    const lockedRows =
      (locked as unknown as { rows?: Array<{ value: string }> }).rows ??
      (Array.isArray(locked) ? (locked as Array<{ value: string }>) : []);
    let next = Number(lockedRows[0]?.value ?? "1");
    if (!Number.isInteger(next) || next < 1) next = 1;

    let candidate = `${prefix}-${String(next).padStart(4, "0")}`;
    for (let guard = 0; guard < 500; guard += 1) {
      const existing = await tx
        .select({ id: hrStaffProfiles.id })
        .from(hrStaffProfiles)
        .where(
          and(
            eq(hrStaffProfiles.firmId, firmId),
            eq(hrStaffProfiles.employeeNumber, candidate),
          ),
        )
        .limit(1);
      if (!existing[0]) break;
      next += 1;
      candidate = `${prefix}-${String(next).padStart(4, "0")}`;
    }

    await tx
      .update(firmSettings)
      .set({ value: String(next + 1), updatedAt: new Date() })
      .where(
        and(
          eq(firmSettings.firmId, firmId),
          eq(firmSettings.key, NEXT_EMPLOYEE_NUMBER_KEY),
        ),
      );

    return candidate;
  });
}

/** Allocate trust movement reference (TR-0001 per firm). */
export async function allocateTrustReferenceNumber(firmId: string): Promise<string> {
  const db = getDb();
  const prefixExisting = await getFirmSetting(firmId, TRUST_REF_PREFIX_KEY);
  const prefix = prefixExisting || "TR";
  if (!prefixExisting) {
    await upsertFirmSetting(firmId, TRUST_REF_PREFIX_KEY, prefix);
  }

  return db.transaction(async (tx) => {
    await tx
      .insert(firmSettings)
      .values({
        firmId,
        key: NEXT_TRUST_REF_NUMBER_KEY,
        value: "1",
        updatedAt: new Date(),
      })
      .onConflictDoNothing({
        target: [firmSettings.firmId, firmSettings.key],
      });

    const locked = await tx.execute<{ value: string }>(sql`
      select value from firm_settings
      where firm_id = ${firmId} and key = ${NEXT_TRUST_REF_NUMBER_KEY}
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
          eq(firmSettings.key, NEXT_TRUST_REF_NUMBER_KEY),
        ),
      );

    return `${prefix}-${String(next).padStart(4, "0")}`;
  });
}
