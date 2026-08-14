/**
 * DEV ONLY: Zimbabwe-flavoured Phase 1 demo data for the pilot firm.
 *
 * Usage:
 *   DEV_SEED_ENABLED=1 npm run db:seed:phase1-demo
 *
 * Idempotent: skips if firm_settings key phase1_demo_seeded_at exists.
 */
import { randomUUID } from "crypto";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  clients,
  documents,
  firmSettings,
  firms,
  matterEvents,
  matterTeam,
  matters,
  pendingProcedures,
  relatedParties,
  roles,
  templates,
  templateVersions,
  users,
} from "../lib/db/schema";
import {
  STARTER_TEMPLATE_DEFS,
  buildStarterDocxBuffer,
} from "../lib/templates/starters";

config({ path: ".env.local" });

const SEED_KEY = "phase1_demo_seeded_at";
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET?.trim() || "firm-files";

function assertDevSeedAllowed() {
  if (process.env.DEV_SEED_ENABLED !== "1") {
    console.error("Set DEV_SEED_ENABLED=1 to run Phase 1 demo seed.");
    process.exit(1);
  }
  if (process.env.NODE_ENV === "production") {
    console.error("Refusing to seed demo data in production.");
    process.exit(1);
  }
}

async function main() {
  assertDevSeedAllowed();

  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !supabaseUrl || !serviceKey) {
    throw new Error("DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY required.");
  }

  const sql = postgres(url, { ssl: "require", prepare: false, max: 1 });
  const db = drizzle(sql);
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

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
    console.log(`Phase 1 demo already seeded at ${existing[0].value}. Skipping.`);
    await sql.end({ timeout: 5 });
    return;
  }

  const allRoles = await db.select().from(roles);
  const roleByCode = Object.fromEntries(allRoles.map((r) => [r.code, r]));
  const mpRole = roleByCode.managing_partner;
  const juniorRole = roleByCode.junior_associate;
  if (!mpRole) throw new Error("Run npm run db:seed:rbac first.");

  const [mp] = await db
    .select()
    .from(users)
    .where(and(eq(users.firmId, pilotFirm.id), eq(users.roleId, mpRole.id)))
    .limit(1);
  if (!mp) throw new Error("No Managing Partner in pilot firm.");

  const [junior] = juniorRole
    ? await db
        .select()
        .from(users)
        .where(and(eq(users.firmId, pilotFirm.id), eq(users.roleId, juniorRole.id)))
        .limit(1)
    : [];

  console.log(`Seeding Phase 1 demo into ${pilotFirm.name}…`);

  // --- Clients ---
  const [tendai] = await db
    .insert(clients)
    .values({
      firmId: pilotFirm.id,
      clientNumber: "CL0001",
      clientType: "individual",
      firstName: "Tendai",
      surname: "Moyo",
      fullName: "Tendai Moyo",
      nationalIdOrRegNumber: "63-123456A63",
      idNumber: "63-123456A63",
      email: "tendai.moyo@example.zw",
      phone: "+263 77 123 4567",
      whatsapp: "+263 77 123 4567",
      physicalAddress: "12 Samora Machel Avenue, Harare",
      residentialAddress: "12 Samora Machel Avenue, Harare",
      postalAddress: "P.O. Box CY 400, Causeway, Harare",
      kycNotes: "Demo KYC: National ID verified (seed).",
      kycStatus: "complete",
      createdBy: mp.id,
    })
    .returning();

  const [chitungwiza] = await db
    .insert(clients)
    .values({
      firmId: pilotFirm.id,
      clientNumber: "CL0002",
      clientType: "corporate",
      legalName: "Chitungwiza Trading (Private) Limited",
      registeredName: "Chitungwiza Trading (Private) Limited",
      tradingName: "Chitungwiza Trading",
      fullName: "Chitungwiza Trading (Private) Limited",
      nationalIdOrRegNumber: "1234/2019",
      regTaxNumber: "200012345",
      taxNumber: "200012345",
      email: "accounts@chitungwiza-trading.example.zw",
      phone: "+263 24 2123456",
      whatsapp: "+263 24 2123456",
      physicalAddress: "Unit 4, Seke Road Industrial Area, Chitungwiza",
      registeredAddress: "Unit 4, Seke Road Industrial Area, Chitungwiza",
      kycStatus: "complete",
      createdBy: mp.id,
    })
    .returning();

  const [farai] = await db
    .insert(clients)
    .values({
      firmId: pilotFirm.id,
      clientNumber: "CL0003",
      clientType: "individual",
      firstName: "Farai",
      surname: "Ncube",
      fullName: "Farai Ncube",
      email: "farai.ncube@example.zw",
      phone: "+263 71 987 6543",
      whatsapp: "+263 71 987 6543",
      physicalAddress: "45 Jason Moyo Street, Bulawayo",
      residentialAddress: "45 Jason Moyo Street, Bulawayo",
      kycStatus: "draft",
      createdBy: mp.id,
    })
    .returning();

  // --- Matters ---
  const [familyMatter] = await db
    .insert(matters)
    .values({
      firmId: pilotFirm.id,
      clientId: tendai!.id,
      title: "Moyo v Moyo — divorce and custody",
      description: "Divorce petition; access and maintenance for minor children.",
      areaOfLaw: "Family",
      status: "open",
      matterNumber: "FAM/HRE/2026/0142",
      fileRef: "TPF/FAM/0142",
      courtName: "High Court of Zimbabwe, Harare",
      caseNumber: "HC 2142/26",
      responsibleLawyerId: mp.id,
      openedAt: new Date(),
      nextHearingAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      priority: "high",
      createdBy: mp.id,
    })
    .returning();

  const [civilMatter] = await db
    .insert(matters)
    .values({
      firmId: pilotFirm.id,
      clientId: chitungwiza!.id,
      title: "Debt recovery — unpaid goods (Harare supplier)",
      description: "Letter of demand then summons for unpaid invoices.",
      areaOfLaw: "Civil",
      status: "open",
      matterNumber: "CIV/HRE/2026/0088",
      fileRef: "TPF/CIV/0088",
      courtName: "Magistrates Court, Harare Civil",
      caseNumber: "MC 88/26",
      responsibleLawyerId: junior?.id ?? mp.id,
      openedAt: new Date(),
      priority: "normal",
      createdBy: mp.id,
    })
    .returning();

  const [labourMatter] = await db
    .insert(matters)
    .values({
      firmId: pilotFirm.id,
      clientId: farai!.id,
      title: "Unfair dismissal — retail supervisor",
      description: "Referral to labour officer; unfair dismissal claim.",
      areaOfLaw: "Labour",
      status: "prospective",
      matterNumber: "LAB/BYO/2026/0031",
      fileRef: "TPF/LAB/0031",
      courtName: "Labour Court / Ministry of Labour",
      responsibleLawyerId: mp.id,
      priority: "normal",
      createdBy: mp.id,
    })
    .returning();

  await db.insert(matterTeam).values([
    {
      firmId: pilotFirm.id,
      matterId: familyMatter!.id,
      userId: mp.id,
      roleOnMatter: "responsible_lawyer",
    },
    {
      firmId: pilotFirm.id,
      matterId: civilMatter!.id,
      userId: junior?.id ?? mp.id,
      roleOnMatter: "responsible_lawyer",
    },
  ]);
  if (junior) {
    await db
      .insert(matterTeam)
      .values({
        firmId: pilotFirm.id,
        matterId: familyMatter!.id,
        userId: junior.id,
        roleOnMatter: "assisting",
      })
      .onConflictDoNothing();
  }

  // --- Parties ---
  await db.insert(relatedParties).values([
    {
      firmId: pilotFirm.id,
      clientId: tendai!.id,
      matterId: familyMatter!.id,
      partyRole: "opposing_party",
      name: "Rumbidzai Moyo",
      contact: "+263 77 555 0101",
      notes: "Respondent spouse (demo).",
    },
    {
      firmId: pilotFirm.id,
      clientId: chitungwiza!.id,
      matterId: civilMatter!.id,
      partyRole: "opposing_party",
      name: "Harare Wholesale Distributors",
      contact: "legal@hwd.example.zw",
      notes: "Debtor / defendant (demo).",
    },
  ]);

  // --- Procedures (include overdue) ---
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db.insert(pendingProcedures).values([
    {
      firmId: pilotFirm.id,
      matterId: familyMatter!.id,
      title: "File Form 29 affidavit of means",
      description: "Overdue demo procedure for dashboard.",
      dueAt: yesterday,
      status: "todo",
      assignedTo: mp.id,
      createdBy: mp.id,
    },
    {
      firmId: pilotFirm.id,
      matterId: civilMatter!.id,
      title: "Serve letter of demand",
      dueAt: nextWeek,
      status: "todo",
      assignedTo: junior?.id ?? mp.id,
      createdBy: mp.id,
    },
    {
      firmId: pilotFirm.id,
      matterId: labourMatter!.id,
      title: "Prepare labour referral form",
      dueAt: nextWeek,
      status: "todo",
      assignedTo: mp.id,
      createdBy: mp.id,
    },
  ]);

  // --- Timeline ---
  await db.insert(matterEvents).values([
    {
      firmId: pilotFirm.id,
      matterId: familyMatter!.id,
      eventType: "note",
      title: "Initial consultation",
      body: "Client instructed on divorce and custody. Discussed High Court timelines.",
      eventAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      createdBy: mp.id,
    },
    {
      firmId: pilotFirm.id,
      matterId: familyMatter!.id,
      eventType: "call",
      title: "Call with client",
      body: "Confirmed school arrangements for the children pending hearing.",
      eventAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      createdBy: mp.id,
    },
    {
      firmId: pilotFirm.id,
      matterId: civilMatter!.id,
      eventType: "email",
      title: "Email to debtor",
      body: "Sent courtesy email requesting settlement before formal demand.",
      eventAt: new Date(),
      createdBy: junior?.id ?? mp.id,
    },
  ]);

  // --- Document fixture ---
  const docId = randomUUID();
  const docFileName = "client-instructions-harare.txt";
  const docPath = `firms/${pilotFirm.id}/matters/${familyMatter!.id}/documents/${docId}/${docFileName}`;
  const docBytes = Buffer.from(
    "LexZim Phase 1 demo fixture\nClient: Tendai Moyo\nMatter: Divorce and custody\nLocation: Harare\n",
    "utf8",
  );

  const { data: buckets } = await admin.storage.listBuckets();
  if (!buckets?.some((b) => b.name === BUCKET)) {
    await admin.storage.createBucket(BUCKET, { public: false });
  }
  const up = await admin.storage.from(BUCKET).upload(docPath, docBytes, {
    contentType: "text/plain",
    upsert: true,
  });
  if (up.error) {
    console.warn(`  document upload skipped: ${up.error.message}`);
  } else {
    await db.insert(documents).values({
      id: docId,
      firmId: pilotFirm.id,
      matterId: familyMatter!.id,
      clientId: tendai!.id,
      title: "Client instructions (Harare)",
      fileName: docFileName,
      mimeType: "text/plain",
      storagePath: docPath,
      sizeBytes: docBytes.byteLength,
      docType: "uploaded",
      createdBy: mp.id,
    });
    console.log("  uploaded document fixture");
  }

  // --- Starter templates if missing ---
  for (const def of STARTER_TEMPLATE_DEFS) {
    const found = await db
      .select({ id: templates.id })
      .from(templates)
      .where(and(eq(templates.firmId, pilotFirm.id), eq(templates.title, def.title)))
      .limit(1);
    if (found[0]) {
      console.log(`  template exists: ${def.title}`);
      continue;
    }
    const templateId = randomUUID();
    const storagePath = `firms/${pilotFirm.id}/templates/${templateId}/v1/${def.fileName}`;
    const bytes = await buildStarterDocxBuffer(def);
    const tUp = await admin.storage.from(BUCKET).upload(storagePath, bytes, {
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: true,
    });
    if (tUp.error) {
      console.warn(`  template upload failed (${def.title}): ${tUp.error.message}`);
      continue;
    }
    await db.insert(templates).values({
      id: templateId,
      firmId: pilotFirm.id,
      title: def.title,
      areaOfLaw: def.areaOfLaw,
      description: def.description,
      bodyFormat: "docx",
      storagePath,
      version: 1,
      isActive: true,
      approvedBy: mp.id,
      approvedAt: new Date(),
      createdBy: mp.id,
    });
    await db.insert(templateVersions).values({
      firmId: pilotFirm.id,
      templateId,
      version: 1,
      storagePath,
      changeNote: "Phase 1 demo seed",
      createdBy: mp.id,
      approvedBy: mp.id,
    });
    console.log(`  seeded template: ${def.title}`);
  }

  const seededAt = new Date().toISOString();
  await db.insert(firmSettings).values({
    firmId: pilotFirm.id,
    key: SEED_KEY,
    value: seededAt,
    updatedAt: new Date(),
  });

  console.log(`\nPhase 1 demo seed complete (${seededAt}).`);
  console.log(`  clients: Tendai Moyo, Chitungwiza Trading, Farai Ncube`);
  console.log(`  matters: Family / Civil / Labour`);
  if (junior) {
    console.log(`  junior assigned to civil (responsible) + family (assisting)`);
  }

  await sql.end({ timeout: 5 });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
