/**
 * DEV ONLY: Phase 3 practice-ops demo data for the pilot firm.
 *
 * Usage:
 *   DEV_SEED_ENABLED=1 npm run db:seed:phase3-demo
 *
 * Prefer Phase 1 demo first (matters/clients). Idempotent via firm_settings.phase3_demo_seeded_at.
 */
import { config } from "dotenv";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  calendarEvents,
  clients,
  conflictChecks,
  deadlineTemplates,
  disbursements,
  feePayments,
  firmSettings,
  firms,
  intakes,
  invoiceLines,
  invoices,
  matterDeadlines,
  matters,
  relatedParties,
  roles,
  timeEntries,
  trustAccounts,
  trustLedgerEntries,
  users,
} from "../lib/db/schema";

config({ path: ".env.local" });

const SEED_KEY = "phase3_demo_seeded_at";

function assertDevSeedAllowed() {
  if (process.env.DEV_SEED_ENABLED !== "1") {
    console.error("Set DEV_SEED_ENABLED=1 to run Phase 3 demo seed.");
    process.exit(1);
  }
  if (process.env.NODE_ENV === "production") {
    console.error("Refusing to seed demo data in production.");
    process.exit(1);
  }
}

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

async function main() {
  assertDevSeedAllowed();

  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL (or DIRECT_URL) required.");

  const sql = postgres(url, { ssl: "require", prepare: false, max: 1 });
  const db = drizzle(sql);

  const allFirms = await db.select().from(firms).orderBy(firms.createdAt);
  const pilotFirm =
    allFirms.find((f) => !f.isDemo && f.slug === "t-pfigu-attorneys") ??
    allFirms.find((f) => !f.isDemo) ??
    allFirms[0];
  if (!pilotFirm) {
    throw new Error("No firm found. Complete /setup first.");
  }

  const existing = await db
    .select()
    .from(firmSettings)
    .where(and(eq(firmSettings.firmId, pilotFirm.id), eq(firmSettings.key, SEED_KEY)))
    .limit(1);
  if (existing[0]) {
    console.log(`Phase 3 demo already seeded at ${existing[0].value}. Skipping.`);
    try {
      await sql.end({ timeout: 2 });
    } catch {
      /* ignore */
    }
    process.exit(0);
  }

  const allRoles = await db.select().from(roles);
  const mpRole = allRoles.find((r) => r.code === "managing_partner");
  if (!mpRole) throw new Error("Run npm run db:seed:rbac first.");

  const [mp] = await db
    .select()
    .from(users)
    .where(and(eq(users.firmId, pilotFirm.id), eq(users.roleId, mpRole.id)))
    .limit(1);
  if (!mp) throw new Error("No Managing Partner in pilot firm.");

  const firmMatters = await db
    .select()
    .from(matters)
    .where(eq(matters.firmId, pilotFirm.id))
    .limit(5);
  if (!firmMatters.length) {
    throw new Error("No matters found. Run DEV_SEED_ENABLED=1 npm run db:seed:phase1-demo first.");
  }

  const matter = firmMatters[0]!;
  const currency = pilotFirm.defaultCurrency || "USD";

  console.log(`Seeding Phase 3 demo into ${pilotFirm.name}…`);

  // Calendar hearing
  await db.insert(calendarEvents).values({
    firmId: pilotFirm.id,
    matterId: matter.id,
    eventType: "hearing",
    title: "Case management hearing (demo)",
    description: "Phase 3 demo calendar event",
    location: "Harare High Court",
    startsAt: daysFromNow(10),
    endsAt: daysFromNow(10),
    allDay: false,
    createdBy: mp.id,
  });

  // Deadline template + applied deadline
  const [tmpl] = await db
    .insert(deadlineTemplates)
    .values({
      firmId: pilotFirm.id,
      name: "Plea / notice (+14 days)",
      areaOfLaw: matter.areaOfLaw,
      description: "Demo filing deadline template",
      offsetDays: 14,
      defaultEventType: "filing",
      isActive: true,
    })
    .returning();

  await db.insert(matterDeadlines).values({
    firmId: pilotFirm.id,
    matterId: matter.id,
    templateId: tmpl.id,
    title: "File notice of intention to defend (demo)",
    dueAt: daysFromNow(14),
    status: "open",
    notes: "Seeded from Phase 3 demo",
    createdBy: mp.id,
  });

  // Time + disbursement (unbilled first, then invoice)
  const [timeRow] = await db
    .insert(timeEntries)
    .values({
      firmId: pilotFirm.id,
      matterId: matter.id,
      userId: mp.id,
      workedAt: daysFromNow(-3),
      minutes: 90,
      billable: true,
      rateCents: 15000,
      currency,
      description: "Consultation and advice (Phase 3 demo)",
    })
    .returning();

  const [costRow] = await db
    .insert(disbursements)
    .values({
      firmId: pilotFirm.id,
      matterId: matter.id,
      description: "Court filing fee (demo)",
      amountCents: 2500,
      currency,
      incurredAt: daysFromNow(-2),
      billable: true,
      createdBy: mp.id,
    })
    .returning();

  const timeAmount = Math.round((90 / 60) * 15000);
  const totalCents = timeAmount + 2500;
  const issueDate = daysFromNow(-1);
  const dueDate = daysFromNow(29);

  const [invoice] = await db
    .insert(invoices)
    .values({
      firmId: pilotFirm.id,
      matterId: matter.id,
      clientId: matter.clientId,
      invoiceNumber: "P3-DEMO-001",
      status: "sent",
      currency,
      issueDate,
      dueDate,
      subtotalCents: totalCents,
      taxCents: 0,
      totalCents,
      notes: "Phase 3 demo fee note (not trust)",
      createdBy: mp.id,
    })
    .returning();

  await db.insert(invoiceLines).values([
    {
      firmId: pilotFirm.id,
      invoiceId: invoice.id,
      lineType: "time",
      description: timeRow.description ?? "Time",
      quantity: 1.5,
      unitAmountCents: 15000,
      amountCents: timeAmount,
      sourceId: timeRow.id,
      sortOrder: 0,
    },
    {
      firmId: pilotFirm.id,
      invoiceId: invoice.id,
      lineType: "disbursement",
      description: costRow.description,
      quantity: 1,
      unitAmountCents: 2500,
      amountCents: 2500,
      sourceId: costRow.id,
      sortOrder: 1,
    },
  ]);

  await db
    .update(timeEntries)
    .set({ invoiceId: invoice.id, updatedAt: new Date() })
    .where(eq(timeEntries.id, timeRow.id));
  await db
    .update(disbursements)
    .set({ invoiceId: invoice.id })
    .where(eq(disbursements.id, costRow.id));

  await db.insert(feePayments).values({
    firmId: pilotFirm.id,
    invoiceId: invoice.id,
    amountCents: Math.min(5000, totalCents),
    currency,
    paidAt: new Date(),
    method: "transfer",
    reference: "P3-DEMO-FEE-RCP",
    notes: "Partial fee receipt. Not a trust deposit.",
    createdBy: mp.id,
  });

  // Trust account + receipt (separate from fees)
  const [trustAcct] = await db
    .insert(trustAccounts)
    .values({
      firmId: pilotFirm.id,
      name: "Client Trust Account (demo)",
      currency,
      accountRef: "TRUST-DEMO-001",
      isActive: true,
    })
    .returning();

  await db.insert(trustLedgerEntries).values({
    firmId: pilotFirm.id,
    trustAccountId: trustAcct.id,
    matterId: matter.id,
    clientId: matter.clientId,
    entryType: "receipt",
    amountCents: 100000,
    currency,
    occurredAt: new Date(),
    reference: "P3-DEMO-TRUST-RCP",
    narrative: "Client deposit held in trust (demo)",
    createdBy: mp.id,
  });

  // Open intake + clear conflict check (ready for conversion demos)
  const [intake] = await db
    .insert(intakes)
    .values({
      firmId: pilotFirm.id,
      status: "open",
      prospectName: "Rutendo Chikwanda",
      contactEmail: "rutendo.demo@example.zw",
      contactPhone: "+263 71 555 0101",
      areaOfLaw: "Civil",
      matterSummary: "Demand letter dispute (Phase 3 demo intake)",
      opposingParty: "Sunrise Hardware (Pvt) Ltd",
      assignedTo: mp.id,
      createdBy: mp.id,
    })
    .returning();

  await db.insert(conflictChecks).values({
    firmId: pilotFirm.id,
    intakeId: intake.id,
    query: "Rutendo Chikwanda; Sunrise Hardware (Pvt) Ltd",
    result: "clear",
    notes: JSON.stringify({
      v: 1,
      hitCount: 0,
      hits: [],
      disclaimer:
        "Conflict search is an operational helper within this firm only. It is not legal advice.",
    }),
    checkedBy: mp.id,
    checkedAt: new Date(),
  });

  // Second matter: opposing party already on file helps conflict demos if names collide
  if (firmMatters[1]) {
    await db.insert(relatedParties).values({
      firmId: pilotFirm.id,
      matterId: firmMatters[1].id,
      clientId: firmMatters[1].clientId,
      partyRole: "opposing_party",
      name: "Demo Opposing Party Seed",
      notes: "Phase 3 conflict search fixture",
    });
  }

  await db.insert(firmSettings).values({
    firmId: pilotFirm.id,
    key: SEED_KEY,
    value: new Date().toISOString(),
  });

  console.log("Phase 3 demo seed complete:");
  console.log(`  matter=${matter.id}`);
  console.log(`  invoice=${invoice.invoiceNumber}`);
  console.log(`  trust=${trustAcct.name}`);
  console.log(`  intake=${intake.prospectName}`);

  try {
    await sql.end({ timeout: 2 });
  } catch {
    /* pooler may hang; force exit */
  }
  process.exit(0);
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
