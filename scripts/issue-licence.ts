/**
 * Issue / activate / backfill firm licences (ops CLI).
 *
 * Examples:
 *   npx tsx scripts/issue-licence.ts --backfill-trials
 *   npx tsx scripts/issue-licence.ts --firm-slug tpfigu-attorneys --edition firm --seats 10 --days 365
 *   npx tsx scripts/issue-licence.ts --firm-id <uuid> --edition trial --days 30
 *   npx tsx scripts/issue-licence.ts --firm-slug demo --revoke
 */
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { firms, firmLicences } from "../lib/db/schema";
import {
  DEFAULT_SEATS,
  DEFAULT_TRIAL_DAYS,
  defaultFeaturesForEdition,
  isLicenceEdition,
  type LicenceEdition,
} from "../lib/licensing/types";

config({ path: ".env.local" });

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL or DIRECT_URL missing");

  const sql = postgres(url, { ssl: "require", prepare: false, max: 1 });
  const db = drizzle(sql);

  try {
    if (hasFlag("--backfill-trials")) {
      const all = await db.select({ id: firms.id, name: firms.name, slug: firms.slug }).from(firms);
      let created = 0;
      for (const firm of all) {
        const existing = await db
          .select()
          .from(firmLicences)
          .where(eq(firmLicences.firmId, firm.id))
          .limit(1);
        if (existing[0]) continue;
        const issuedAt = new Date();
        const expiresAt = new Date(
          issuedAt.getTime() + DEFAULT_TRIAL_DAYS * 24 * 60 * 60 * 1000,
        );
        await db.insert(firmLicences).values({
          firmId: firm.id,
          edition: "trial",
          seats: DEFAULT_SEATS.trial,
          featuresJson: defaultFeaturesForEdition("trial"),
          status: "active",
          issuedAt,
          expiresAt,
          notes: "CLI backfill trial",
          issuedBy: "cli",
          updatedAt: issuedAt,
          createdAt: issuedAt,
        });
        created += 1;
        console.log(`  trial → ${firm.slug} (${firm.name})`);
      }
      console.log(`Backfill complete. Created ${created} trial licence(s).`);
      return;
    }

    const firmIdArg = arg("--firm-id");
    const firmSlug = arg("--firm-slug");
    let firmId = firmIdArg?.trim() ?? "";

    if (!firmId && firmSlug) {
      const rows = await db
        .select()
        .from(firms)
        .where(eq(firms.slug, firmSlug.trim().toLowerCase()))
        .limit(1);
      if (!rows[0]) throw new Error(`Firm slug not found: ${firmSlug}`);
      firmId = rows[0].id;
      console.log(`Resolved ${firmSlug} → ${firmId}`);
    }
    if (!firmId) {
      throw new Error("Pass --firm-id, --firm-slug, or --backfill-trials");
    }

    if (hasFlag("--revoke")) {
      const now = new Date();
      const existing = await db
        .select()
        .from(firmLicences)
        .where(eq(firmLicences.firmId, firmId))
        .limit(1);
      if (!existing[0]) throw new Error("No licence row to revoke.");
      await db
        .update(firmLicences)
        .set({
          status: "revoked",
          notes: arg("--notes") ?? existing[0].notes,
          issuedBy: "cli",
          updatedAt: now,
        })
        .where(eq(firmLicences.firmId, firmId));
      console.log("Licence revoked for", firmId);
      return;
    }

    const editionRaw = (arg("--edition") ?? "trial").toLowerCase();
    if (!isLicenceEdition(editionRaw)) {
      throw new Error("--edition must be trial, solo, or firm");
    }
    const edition = editionRaw as LicenceEdition;
    const seats = Number(arg("--seats") ?? DEFAULT_SEATS[edition]);
    if (!Number.isInteger(seats) || seats < 1) throw new Error("Invalid --seats");

    const daysRaw = arg("--days");
    const noExpiry = hasFlag("--no-expiry");
    const issuedAt = new Date();
    let expiresAt: Date | null = null;
    if (noExpiry) {
      expiresAt = null;
    } else if (daysRaw !== undefined) {
      const days = Number(daysRaw);
      if (!Number.isFinite(days) || days < 1) throw new Error("Invalid --days");
      expiresAt = new Date(issuedAt.getTime() + days * 24 * 60 * 60 * 1000);
    } else if (edition === "trial") {
      expiresAt = new Date(issuedAt.getTime() + DEFAULT_TRIAL_DAYS * 24 * 60 * 60 * 1000);
    } else {
      expiresAt = new Date(issuedAt.getTime() + 365 * 24 * 60 * 60 * 1000);
    }

    const notes = arg("--notes") ?? null;
    const values = {
      firmId,
      edition,
      seats,
      featuresJson: defaultFeaturesForEdition(edition),
      status: "active" as const,
      issuedAt,
      expiresAt,
      notes,
      issuedBy: "cli",
      updatedAt: issuedAt,
      createdAt: issuedAt,
    };

    const existing = await db
      .select()
      .from(firmLicences)
      .where(eq(firmLicences.firmId, firmId))
      .limit(1);

    if (existing[0]) {
      await db
        .update(firmLicences)
        .set({
          edition: values.edition,
          seats: values.seats,
          featuresJson: values.featuresJson,
          status: values.status,
          issuedAt: values.issuedAt,
          expiresAt: values.expiresAt,
          notes: values.notes ?? existing[0].notes,
          issuedBy: values.issuedBy,
          updatedAt: values.updatedAt,
        })
        .where(eq(firmLicences.firmId, firmId));
      console.log("Updated licence:", {
        firmId,
        edition,
        seats,
        expiresAt: expiresAt?.toISOString() ?? null,
      });
    } else {
      await db.insert(firmLicences).values(values);
      console.log("Issued licence:", {
        firmId,
        edition,
        seats,
        expiresAt: expiresAt?.toISOString() ?? null,
      });
    }
  } finally {
    await sql.end({ timeout: 5 });
    process.exit(0);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
