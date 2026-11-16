/**
 * Fictional practice for the LexZim guide, Isolation Test Firm only.
 * Does not touch any other firm. Safe to run again: it skips if the guide client exists.
 *
 *   npx tsx scripts/seed-isolation-guide.ts
 */
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { config } from "dotenv";
import { eq } from "drizzle-orm";

const require = createRequire(import.meta.url);
const so = require.resolve("server-only");
require.cache[so] = { id: so, filename: so, loaded: true, exports: {} };
config({ path: resolve(process.cwd(), ".env.local") });

const MARKER = "rudo.ncube@acacia.example";
const DISPLAY_NAME = "Acacia Law";

async function main() {
  const { getDb } = await import("../lib/db");
  const { clients, firms, roles, users } = await import("../lib/db/schema");
  const { createClient } = await import("../lib/repos/clients");
  const { createMatter } = await import("../lib/repos/matters");
  const { createConflictCheck } = await import("../lib/repos/conflict-checks");
  const { createTrackingEntry } = await import("../lib/repos/matter-tracking");
  const { createCalendarEvent } = await import("../lib/repos/calendar");
  const { createFirmTask } = await import("../lib/repos/firm-tasks");
  const { createInvoiceFromServices } = await import("../lib/repos/billing");

  const db = getDb();
  const firmRows = await db
    .select()
    .from(firms)
    .where(eq(firms.slug, "isolation-test-firm"))
    .limit(1);
  const firm = firmRows[0];
  if (!firm) throw new Error("Isolation Test Firm was not found. Nothing was written.");

  const previousName = firm.name;
  if (firm.name !== DISPLAY_NAME) {
    await db.update(firms).set({ name: DISPLAY_NAME, updatedAt: new Date() }).where(eq(firms.id, firm.id));
  }

  const existing = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.firmId, firm.id));
  const marked = await db
    .select({ id: clients.id, email: clients.email })
    .from(clients)
    .where(eq(clients.firmId, firm.id));
  if (marked.some((row) => row.email === MARKER)) {
    console.log(
      JSON.stringify({
        alreadySeeded: true,
        firmId: firm.id,
        previousName,
        displayName: DISPLAY_NAME,
        clients: existing.length,
      }),
    );
    process.exit(0);
  }

  const staff = await db
    .select({ id: users.id, fullName: users.fullName, email: users.email, roleCode: roles.code })
    .from(users)
    .innerJoin(roles, eq(roles.id, users.roleId))
    .where(eq(users.firmId, firm.id));
  const actor =
    staff.find((row) => row.roleCode === "managing_partner" && row.email === "isolation@lexzim.local") ??
    staff.find((row) => row.roleCode === "managing_partner") ??
    staff[0];
  if (!actor) throw new Error("Isolation Test Firm has no user to own the guide records.");

  const person = await createClient(firm.id, actor.id, {
    clientType: "individual",
    firstName: "Rudo",
    surname: "Ncube",
    fullName: "Rudo Ncube",
    email: MARKER,
    phone: "+263 77 000 1101",
    residentialAddress: "12 Jacaranda Close, Hillside, Bulawayo",
    nationality: "Zimbabwean",
    occupation: "Teacher",
    sourceOfFunds: "salary_employment",
    kycStatus: "complete",
    responsibleLawyerId: actor.id,
  });

  const company = await createClient(firm.id, actor.id, {
    clientType: "corporate",
    legalName: "Kestrel Properties (Private) Limited",
    registeredName: "Kestrel Properties (Private) Limited",
    tradingName: "Kestrel Properties",
    email: "kestrel.properties@acacia.example",
    phone: "+263 24 200 4410",
    registeredAddress: "4 Nelson Mandela Avenue, Harare",
    industry: "Property",
    sourceOfFunds: "business_income",
    kycStatus: "complete",
    responsibleLawyerId: actor.id,
  });

  for (const client of [person, company]) {
    await createConflictCheck(firm.id, actor.id, {
      clientId: client.id,
      query: client.email ?? client.id,
      result: "clear",
      notes: "Guide fixture. No conflict found.",
    });
  }

  const court = await createMatter(firm.id, actor.id, {
    clientId: person.id,
    title: "Ncube v Dube",
    description: "Civil claim for a boundary wall. Fictional guide file.",
    areaOfLaw: "Civil",
    status: "open",
    courtName: "High Court of Zimbabwe, Harare",
    caseNumber: "HC 1842/26",
    responsibleLawyerId: actor.id,
    nextHearingAt: "2026-10-30T07:00:00.000Z",
    priority: "high",
  });

  const lease = await createMatter(firm.id, actor.id, {
    clientId: company.id,
    title: "Lease: Stand 12 Hillside",
    description: "Commercial lease for a shop. Fictional guide file.",
    areaOfLaw: "Property/Conveyancing",
    status: "open",
    responsibleLawyerId: actor.id,
    priority: "normal",
  });

  await createMatter(firm.id, actor.id, {
    clientId: company.id,
    title: "Supply agreement: Kestrel",
    description: "Sale of building materials. Fictional guide file.",
    areaOfLaw: "Corporate/Commercial",
    status: "open",
    responsibleLawyerId: actor.id,
    priority: "normal",
  });

  await createTrackingEntry(firm.id, court.id, actor.id, {
    summary: "Pending hearing",
    happensOn: "2026-10-30",
  });

  await createCalendarEvent(firm.id, actor.id, {
    matterId: lease.id,
    clientId: company.id,
    eventType: "appointment",
    title: "Meeting: lease heads of terms",
    description: "Walk through the lease with the client. Fictional guide entry.",
    location: "Chambers",
    startsAt: new Date("2026-10-15T08:00:00.000Z"),
    endsAt: new Date("2026-10-15T09:00:00.000Z"),
    allDay: false,
    visibility: "firm",
    sharedUserIds: [],
    notifyClient: false,
  });

  await createFirmTask(firm.id, actor.id, {
    title: "File the plea in Ncube v Dube",
    description: "Guide fixture. Prepare the plea before the hearing.",
    assigneeUserId: actor.id,
    dueAt: new Date("2026-10-20T08:00:00.000Z"),
    priority: "high",
  });

  const invoice = await createInvoiceFromServices(
    firm.id,
    actor.id,
    {
      clientId: person.id,
      matterId: court.id,
      subject: "Professional fees to date",
      paymentTerms: "14 days",
      currency: firm.defaultCurrency || "USD",
      notes: "Fictional guide invoice. Not a live client bill.",
      lines: [
        {
          description: "Taking instructions and drafting the claim",
          qty: 1,
          unitPriceCents: 25000,
        },
      ],
    },
    { currency: firm.defaultCurrency || "USD" },
  );

  console.log(
    JSON.stringify({
      alreadySeeded: false,
      firmId: firm.id,
      previousName,
      displayName: DISPLAY_NAME,
      actor: actor.fullName,
      clients: [person.clientNumber, company.clientNumber],
      matters: [court.matterNumber, lease.matterNumber],
      invoice: invoice.invoiceNumber,
    }),
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
