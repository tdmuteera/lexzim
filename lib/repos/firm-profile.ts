/**
 * Firm profile + billing prefs for onboarding / Settings (P4-10).
 */
import "server-only";

import { eq } from "drizzle-orm";
import { AuthError } from "@/lib/auth/types";
import { getDb } from "@/lib/db";
import { firms } from "@/lib/db/schema";
import {
  getFirmSetting,
  getInvoiceDueDays,
  INVOICE_DUE_DAYS_KEY,
  INVOICE_PREFIX_KEY,
  ONBOARDING_PROFILE_CONFIRMED_AT_KEY,
  upsertFirmSetting,
} from "@/lib/repos/firm-settings";

export type FirmProfileDto = {
  id: string;
  name: string;
  slug: string;
  status: string;
  defaultCurrency: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  country: string | null;
  invoicePrefix: string;
  invoiceDueDays: number;
  profileConfirmedAt: string | null;
};

function trimOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export async function getFirmProfile(firmId: string): Promise<FirmProfileDto | null> {
  const db = getDb();
  const rows = await db.select().from(firms).where(eq(firms.id, firmId)).limit(1);
  const firm = rows[0];
  if (!firm) return null;

  const [prefix, dueDays, confirmed] = await Promise.all([
    getFirmSetting(firmId, INVOICE_PREFIX_KEY),
    getInvoiceDueDays(firmId),
    getFirmSetting(firmId, ONBOARDING_PROFILE_CONFIRMED_AT_KEY),
  ]);

  return {
    id: firm.id,
    name: firm.name,
    slug: firm.slug,
    status: firm.status,
    defaultCurrency: firm.defaultCurrency,
    contactEmail: firm.contactEmail,
    contactPhone: firm.contactPhone,
    addressLine1: firm.addressLine1,
    addressLine2: firm.addressLine2,
    city: firm.city,
    country: firm.country,
    invoicePrefix: prefix?.trim() || "INV",
    invoiceDueDays: dueDays,
    profileConfirmedAt: confirmed,
  };
}

export type UpdateFirmProfileInput = {
  name?: string;
  defaultCurrency?: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  country?: string | null;
  invoicePrefix?: string;
  invoiceDueDays?: number;
  confirmProfile?: boolean;
};

export async function updateFirmProfile(
  firmId: string,
  input: UpdateFirmProfileInput,
): Promise<FirmProfileDto> {
  const db = getDb();
  const existing = await getFirmProfile(firmId);
  if (!existing) throw new AuthError("not_found", "Firm not found.");

  const name =
    input.name !== undefined ? input.name.trim() : existing.name;
  if (!name) throw new AuthError("validation", "Firm name is required.");

  const defaultCurrency =
    input.defaultCurrency !== undefined
      ? input.defaultCurrency.trim().toUpperCase()
      : existing.defaultCurrency;
  if (input.defaultCurrency !== undefined) {
    if (!defaultCurrency || defaultCurrency.length < 3 || defaultCurrency.length > 8) {
      throw new AuthError(
        "validation",
        "defaultCurrency must be a short code (e.g. USD, ZWG).",
      );
    }
  }

  if (input.invoicePrefix !== undefined) {
    const prefix = input.invoicePrefix.trim().toUpperCase();
    if (!prefix || prefix.length > 12 || !/^[A-Z0-9_-]+$/.test(prefix)) {
      throw new AuthError(
        "validation",
        "invoicePrefix must be 1–12 letters, numbers, underscore, or hyphen.",
      );
    }
    await upsertFirmSetting(firmId, INVOICE_PREFIX_KEY, prefix);
  }

  if (input.invoiceDueDays !== undefined) {
    const days = input.invoiceDueDays;
    if (!Number.isInteger(days) || days < 0 || days > 365) {
      throw new AuthError("validation", "invoiceDueDays must be 0–365.");
    }
    await upsertFirmSetting(firmId, INVOICE_DUE_DAYS_KEY, String(days));
  }

  await db
    .update(firms)
    .set({
      name,
      defaultCurrency: defaultCurrency ?? existing.defaultCurrency,
      contactEmail:
        input.contactEmail !== undefined
          ? trimOrNull(input.contactEmail)
          : existing.contactEmail,
      contactPhone:
        input.contactPhone !== undefined
          ? trimOrNull(input.contactPhone)
          : existing.contactPhone,
      addressLine1:
        input.addressLine1 !== undefined
          ? trimOrNull(input.addressLine1)
          : existing.addressLine1,
      addressLine2:
        input.addressLine2 !== undefined
          ? trimOrNull(input.addressLine2)
          : existing.addressLine2,
      city: input.city !== undefined ? trimOrNull(input.city) : existing.city,
      country:
        input.country !== undefined ? trimOrNull(input.country) : existing.country,
      updatedAt: new Date(),
    })
    .where(eq(firms.id, firmId));

  if (input.confirmProfile) {
    await upsertFirmSetting(
      firmId,
      ONBOARDING_PROFILE_CONFIRMED_AT_KEY,
      new Date().toISOString(),
    );
  }

  const updated = await getFirmProfile(firmId);
  if (!updated) throw new AuthError("not_found", "Firm not found after update.");
  return updated;
}
