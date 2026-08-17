import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { requireOpsAccess } from "@/lib/platform/ops-guard";
import {
  DEFAULT_SEATS,
  isLicenceEdition,
  type LicenceEdition,
} from "@/lib/licensing/types";
import {
  findFirmIdBySlug,
  getEffectiveLicence,
  issueFirmLicence,
  revokeFirmLicence,
  serializeEffectiveLicence,
} from "@/lib/repos/licences";
import { getDb } from "@/lib/db";
import { firms } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Platform ops: issue/activate a firm licence.
 * Body: { firmId? | firmSlug?, edition, seats?, days?, expiresAt?, notes?, revoke? }
 */
export async function POST(request: Request) {
  try {
    const admin = await requireOpsAccess(request);
    const body = (await request.json()) as {
      firmId?: string;
      firmSlug?: string;
      edition?: string;
      seats?: number;
      days?: number | null;
      expiresAt?: string | null;
      notes?: string;
      revoke?: boolean;
    };

    let firmId = typeof body.firmId === "string" ? body.firmId.trim() : "";
    if (!firmId && body.firmSlug) {
      firmId = (await findFirmIdBySlug(body.firmSlug)) ?? "";
    }
    if (!firmId) {
      throw new AuthError("validation", "firmId or firmSlug is required.");
    }

    const db = getDb();
    const firmRows = await db
      .select({ id: firms.id, name: firms.name, slug: firms.slug })
      .from(firms)
      .where(eq(firms.id, firmId))
      .limit(1);
    const firm = firmRows[0];
    if (!firm) throw new AuthError("not_found", "Firm not found.");

    if (body.revoke) {
      const revoked = await revokeFirmLicence(firmId, {
        notes: body.notes,
        issuedBy: `platform:${admin.email}`,
      });
      if (!revoked) {
        throw new AuthError("not_found", "No licence to revoke.");
      }
      await writeAuditLog({
        action: "licence.revoke",
        firmId,
        userId: admin.id,
        entityType: "firm_licence",
        entityId: firmId,
        metadata: { notes: body.notes ?? null },
        ipOrUserAgent: clientInfo(request),
      });
      const licence = await getEffectiveLicence(firmId);
      return jsonOk({
        firm: { id: firm.id, name: firm.name, slug: firm.slug },
        licence: serializeEffectiveLicence(licence),
      });
    }

    const editionRaw = (body.edition ?? "trial").trim().toLowerCase();
    if (!isLicenceEdition(editionRaw)) {
      throw new AuthError("validation", "edition must be trial, solo, or firm.");
    }
    const edition = editionRaw as LicenceEdition;

    let seats = body.seats;
    if (seats !== undefined) {
      if (!Number.isInteger(seats) || seats < 1 || seats > 500) {
        throw new AuthError("validation", "seats must be an integer from 1 to 500.");
      }
    } else {
      seats = DEFAULT_SEATS[edition];
    }

    let expiresAt: Date | null | undefined = undefined;
    if (body.expiresAt === null) {
      expiresAt = null;
    } else if (typeof body.expiresAt === "string" && body.expiresAt.trim()) {
      const d = new Date(body.expiresAt);
      if (Number.isNaN(d.getTime())) {
        throw new AuthError("validation", "expiresAt must be a valid ISO date.");
      }
      expiresAt = d;
    }

    const row = await issueFirmLicence({
      firmId,
      edition,
      seats,
      days: expiresAt !== undefined ? undefined : body.days,
      expiresAt,
      notes: body.notes ?? null,
      issuedBy: `platform:${admin.email}`,
    });

    await writeAuditLog({
      action: "licence.issue",
      firmId,
      userId: admin.id,
      entityType: "firm_licence",
      entityId: firmId,
      metadata: {
        edition: row.edition,
        seats: row.seats,
        expiresAt: row.expiresAt?.toISOString() ?? null,
        status: row.status,
      },
      ipOrUserAgent: clientInfo(request),
    });

    const licence = await getEffectiveLicence(firmId);
    return jsonOk({
      firm: { id: firm.id, name: firm.name, slug: firm.slug },
      licence: serializeEffectiveLicence(licence),
    });
  } catch (err) {
    return jsonError(err, request);
  }
}

/** Read licence for a firm (platform admin). Query: firmId or firmSlug. */
export async function GET(request: Request) {
  try {
    await requireOpsAccess(request);
    const url = new URL(request.url);
    let firmId = url.searchParams.get("firmId")?.trim() ?? "";
    const slug = url.searchParams.get("firmSlug")?.trim();
    if (!firmId && slug) {
      firmId = (await findFirmIdBySlug(slug)) ?? "";
    }
    if (!firmId) {
      throw new AuthError("validation", "firmId or firmSlug query is required.");
    }
    const licence = await getEffectiveLicence(firmId);
    return jsonOk({ licence: serializeEffectiveLicence(licence) });
  } catch (err) {
    return jsonError(err, request);
  }
}
