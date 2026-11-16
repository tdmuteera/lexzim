/**
 * Lean fictional practice for Isolation Test Firm only.
 * Directory staff have no login and no extra permissions.
 * Invoices stay drafts. No receipts. No client email. No tasks assigned to anyone else.
 *
 *   npx tsx scripts/seed-isolation-load.ts
 */
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { config } from "dotenv";
import { and, eq, sql } from "drizzle-orm";

const require = createRequire(import.meta.url);
const so = require.resolve("server-only");
require.cache[so] = { id: so, filename: so, loaded: true, exports: {} };
config({ path: resolve(process.cwd(), ".env.local") });

const STAFF_MARKER = "tariro.chikomo@acacia.example";

const DIRECTORY = [
  { email: "tariro.chikomo@acacia.example", fullName: "Tariro Chikomo", role: "senior_associate", lawyer: true, title: "Senior Associate" },
  { email: "farai.moyo@acacia.example", fullName: "Farai Moyo", role: "junior_associate", lawyer: true, title: "Associate" },
  { email: "nyasha.dube@acacia.example", fullName: "Nyasha Dube", role: "junior_associate", lawyer: true, title: "Associate" },
  { email: "rumbidzai.ndlovu@acacia.example", fullName: "Rumbidzai Ndlovu", role: "secretary", lawyer: false, title: "Secretary" },
  { email: "blessing.sibanda@acacia.example", fullName: "Blessing Sibanda", role: "accounts", lawyer: false, title: "Accounts" },
] as const;

const PEOPLE: Array<[string, string, string]> = [
  ["Tendai", "Sibanda", "Harare"],
  ["Rutendo", "Moyo", "Bulawayo"],
  ["Tafadzwa", "Ndlovu", "Gweru"],
  ["Chipo", "Dube", "Mutare"],
  ["Simbarashe", "Mpofu", "Kwekwe"],
  ["Yeukai", "Zhou", "Masvingo"],
  ["Panashe", "Gumbo", "Harare"],
  ["Anesu", "Marowa", "Chitungwiza"],
  ["Kudakwashe", "Banda", "Kadoma"],
  ["Munashe", "Sithole", "Harare"],
  ["Tinashe", "Mlilo", "Bulawayo"],
  ["Vimbai", "Nyathi", "Hwange"],
  ["Takudzwa", "Phiri", "Harare"],
  ["Ropafadzo", "Chirwa", "Marondera"],
  ["Tanaka", "Mapfumo", "Harare"],
  ["Kudzi", "Hove", "Bindura"],
  ["Nigel", "Shumba", "Harare"],
  ["Lisa", "Mhaka", "Rusape"],
  ["Brian", "Togarepi", "Harare"],
  ["Grace", "Zvobgo", "Masvingo"],
  ["Peter", "Chari", "Harare"],
  ["Memory", "Ncube", "Bulawayo"],
  ["Owen", "Lunga", "Victoria Falls"],
  ["Sandra", "Makoni", "Harare"],
  ["David", "Ponela", "Gokwe"],
  ["Faith", "Zulu", "Harare"],
  ["George", "Mahlangu", "Plumtree"],
  ["Ivy", "Dlamini", "Beitbridge"],
  ["Henry", "Mlambo", "Harare"],
  ["Caroline", "Ngwenya", "Gwanda"],
];

const COMPANIES = [
  ["Mopane Trading (Private) Limited", "Mopane Trading", "Retail"],
  ["Great Dyke Haulage (Private) Limited", "Great Dyke Haulage", "Transport"],
  ["Jacaranda Clinics (Private) Limited", "Jacaranda Clinics", "Health"],
  ["Sable Ridge Farms (Private) Limited", "Sable Ridge Farms", "Agriculture"],
  ["Copperbelt Spares (Private) Limited", "Copperbelt Spares", "Trade"],
  ["Limpopo Brick (Private) Limited", "Limpopo Brick", "Manufacturing"],
  ["Vumba Tea Estate (Private) Limited", "Vumba Tea Estate", "Agriculture"],
] as const;

const AREAS = [
  "Civil",
  "Family",
  "Property/Conveyancing",
  "Corporate/Commercial",
  "Labour",
  "Criminal",
  "Estates & Trusts",
] as const;

const TRACKING = [
  ["Waiting for the opposing affidavit", "2026-10-22"],
  ["Consultation booked", "2026-10-18"],
  ["Awaiting title deeds", "2026-11-06"],
  ["Plea to be filed", "2026-10-28"],
  ["Settlement offer under review", "2026-11-12"],
  ["Site inspection arranged", "2026-10-24"],
  ["Witness statement outstanding", "2026-11-03"],
  ["Board resolution to be signed", "2026-10-27"],
] as const;

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
  const firm = (
    await db.select().from(firms).where(eq(firms.slug, "isolation-test-firm")).limit(1)
  )[0];
  if (!firm) throw new Error("Isolation Test Firm was not found. Nothing was written.");

  if (firm.name === "Acacia Law") {
    await db
      .update(firms)
      .set({ name: "Isolation Test Firm", updatedAt: new Date() })
      .where(eq(firms.id, firm.id));
  }
  await db
    .update(users)
    .set({ fullName: "Isolation Managing Partner", updatedAt: new Date() })
    .where(
      and(
        eq(users.firmId, firm.id),
        eq(users.email, "isolation@lexzim.local"),
        eq(users.fullName, "Chiedza Moyo"),
      ),
    );

  const marked = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.firmId, firm.id), eq(users.email, STAFF_MARKER)))
    .limit(1);
  if (marked[0]) {
    const [clientCount] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(clients)
      .where(eq(clients.firmId, firm.id));
    console.log(JSON.stringify({ alreadyLoaded: true, clients: clientCount?.n ?? 0 }));
    process.exit(0);
  }

  const roleRows = await db.select({ id: roles.id, code: roles.code }).from(roles);
  const roleId = (code: string) => {
    const row = roleRows.find((item) => item.code === code);
    if (!row) throw new Error(`Missing role ${code}`);
    return row.id;
  };

  const actor = (
    await db
      .select({ id: users.id, fullName: users.fullName })
      .from(users)
      .where(and(eq(users.firmId, firm.id), eq(users.email, "isolation@lexzim.local")))
      .limit(1)
  )[0];
  if (!actor) throw new Error("Isolation managing partner was not found. Nothing else was written.");

  const lawyerIds: string[] = [actor.id];
  for (const person of DIRECTORY) {
    const id = randomUUID();
    await db.insert(users).values({
      id,
      firmId: firm.id,
      email: person.email,
      fullName: person.fullName,
      jobTitle: person.title,
      roleId: roleId(person.role),
      isActive: true,
      isSystemUser: false,
      isLawyer: person.lawyer,
      isTestUser: true,
    });
    if (person.lawyer) lawyerIds.push(id);
  }

  const madeClients: Array<{ id: string; label: string }> = [];
  for (let i = 0; i < PEOPLE.length; i++) {
    const [first, surname, city] = PEOPLE[i]!;
    const row = await createClient(firm.id, actor.id, {
      clientType: "individual",
      firstName: first,
      surname,
      fullName: `${first} ${surname}`,
      email: `${first}.${surname}.load@acacia.example`.toLowerCase(),
      phone: `+263 77 900 ${String(2000 + i).slice(-4)}`,
      residentialAddress: `${city}`,
      nationality: "Zimbabwean",
      sourceOfFunds: "salary_employment",
      kycStatus: i % 7 === 0 ? "pending" : "complete",
      responsibleLawyerId: lawyerIds[i % lawyerIds.length]!,
    });
    madeClients.push({ id: row.id, label: `${first} ${surname}` });
  }

  for (let i = 0; i < COMPANIES.length; i++) {
    const [legal, trading, industry] = COMPANIES[i]!;
    const row = await createClient(firm.id, actor.id, {
      clientType: "corporate",
      legalName: legal,
      registeredName: legal,
      tradingName: trading,
      email: `${trading.toLowerCase().replace(/[^a-z]+/g, ".")}@acacia.example`,
      phone: `+263 24 700 ${String(1100 + i)}`,
      registeredAddress: "Harare",
      industry,
      sourceOfFunds: "business_income",
      kycStatus: "complete",
      responsibleLawyerId: lawyerIds[i % lawyerIds.length]!,
    });
    madeClients.push({ id: row.id, label: trading });
  }

  for (const client of madeClients) {
    await createConflictCheck(firm.id, actor.id, {
      clientId: client.id,
      query: client.label,
      result: "clear",
      notes: "Fictional practice check. No conflict found.",
    });
  }

  const openMatters: Array<{ id: string; clientId: string; title: string }> = [];
  for (let i = 0; i < madeClients.length; i++) {
    const client = madeClients[i]!;
    const area = AREAS[i % AREAS.length]!;
    const status = i % 11 === 0 ? "prospective" : i % 13 === 0 ? "on_hold" : i % 17 === 0 ? "closed" : "open";
    const title =
      area === "Criminal"
        ? `${client.label} criminal matter`
        : area === "Estates & Trusts"
          ? `Estate of ${client.label}`
          : area === "Family"
            ? `${client.label} family matter`
            : area === "Labour"
              ? `${client.label} labour claim`
              : area === "Property/Conveyancing"
                ? `Transfer: ${client.label}`
                : area === "Corporate/Commercial"
                  ? `Agreement: ${client.label}`
                  : `Claim: ${client.label}`;
    const hearing = i < 6 ? `2026-10-${String(16 + i).padStart(2, "0")}T07:00:00.000Z` : null;
    const matter = await createMatter(firm.id, actor.id, {
      clientId: client.id,
      title,
      description: "Fictional practice file.",
      areaOfLaw: area,
      status,
      responsibleLawyerId: lawyerIds[i % lawyerIds.length]!,
      courtName: area === "Criminal" ? "Harare Magistrates Court (Criminal)" : area === "Civil" ? "High Court of Zimbabwe, Harare" : null,
      nextHearingAt: status === "open" ? hearing : null,
      priority: i % 9 === 0 ? "high" : "normal",
    });
    if (status === "open") openMatters.push({ id: matter.id, clientId: client.id, title });
  }

  for (let i = 0; i < TRACKING.length && i < openMatters.length; i++) {
    const [summary, happensOn] = TRACKING[i]!;
    await createTrackingEntry(firm.id, openMatters[i]!.id, actor.id, { summary, happensOn });
  }

  const meetings = openMatters.slice(0, 3);
  for (let i = 0; i < meetings.length; i++) {
    const matter = meetings[i]!;
    const day = 16 + i;
    await createCalendarEvent(firm.id, actor.id, {
      matterId: matter.id,
      clientId: matter.clientId,
      eventType: "appointment",
      title: `Meeting: ${matter.title}`,
      description: "Fictional practice meeting.",
      location: "Chambers",
      startsAt: new Date(`2026-10-${day}T09:00:00.000Z`),
      endsAt: new Date(`2026-10-${day}T10:00:00.000Z`),
      allDay: false,
      visibility: "firm",
      sharedUserIds: [],
      notifyClient: false,
    });
  }

  for (const title of ["Collect the outstanding KYC copies", "Diary the October hearings", "Prepare the fee notes for review"]) {
    await createFirmTask(firm.id, actor.id, {
      title,
      description: "Fictional practice task.",
      assigneeUserId: actor.id,
      dueAt: new Date("2026-10-21T08:00:00.000Z"),
      priority: "normal",
    });
  }

  const amounts = [15000, 20000, 35000, 50000, 18000, 42000];
  const currency = firm.defaultCurrency || "USD";
  const invoiceNumbers: string[] = [];
  for (let i = 0; i < amounts.length && i < openMatters.length; i++) {
    const matter = openMatters[i + 6] ?? openMatters[i]!;
    const invoice = await createInvoiceFromServices(
      firm.id,
      actor.id,
      {
        clientId: matter.clientId,
        matterId: matter.id,
        subject: "Professional fees to date",
        paymentTerms: "14 days",
        currency,
        notes: "Fictional practice invoice. Draft only. Not a live client bill.",
        lines: [{ description: "Professional services to date", qty: 1, unitPriceCents: amounts[i]! }],
      },
      { currency },
    );
    invoiceNumbers.push(invoice.invoiceNumber);
  }

  const [clientCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(clients)
    .where(eq(clients.firmId, firm.id));

  console.log(
    JSON.stringify({
      alreadyLoaded: false,
      firmId: firm.id,
      displayName: "Isolation Test Firm",
      directoryStaff: DIRECTORY.map((person) => person.fullName),
      clientsAdded: madeClients.length,
      clientsOnFirm: clientCount?.n ?? 0,
      mattersAdded: madeClients.length,
      draftInvoices: invoiceNumbers,
    }),
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
