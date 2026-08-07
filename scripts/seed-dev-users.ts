/**
 * DEV ONLY: seed demo users per RBAC role + isolation test firm.
 *
 * Usage:
 *   DEV_SEED_ENABLED=1 npm run db:seed:dev-users
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY and DATABASE_URL in .env.local
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { auditLogs, firms, roles, users } from "../lib/db/schema";
import {
  DEV_SEED_PASSWORD,
  ISOLATION_FIRM,
  PILOT_FIRM_DEV_USERS,
} from "../lib/seed/dev-users";

config({ path: ".env.local" });

function assertDevSeedAllowed() {
  if (process.env.DEV_SEED_ENABLED !== "1") {
    console.error("Set DEV_SEED_ENABLED=1 to run dev user seed.");
    process.exit(1);
  }
  if (process.env.NODE_ENV === "production") {
    console.error("Refusing to seed dev users in production.");
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
    throw new Error("No firm found. Run first-run setup (/setup) before seeding dev users.");
  }

  console.log(`Pilot firm: ${pilotFirm.name} (${pilotFirm.slug})`);

  const allRoles = await db.select().from(roles);
  const roleByCode = Object.fromEntries(allRoles.map((r) => [r.code, r]));

  const mpRole = roleByCode.managing_partner;
  if (!mpRole) throw new Error("managing_partner role missing. Run npm run db:seed:rbac");

  const existingMp = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.firmId, pilotFirm.id), eq(users.roleId, mpRole.id)))
    .limit(1);

  if (!existingMp[0]) {
    console.log("No Managing Partner in pilot firm — create one via /setup (not auto-seeded here).");
  } else {
    console.log("Managing Partner exists — skipping MP seed.");
  }

  async function upsertDevUser(
    firmId: string,
    email: string,
    fullName: string,
    roleCode: string,
    auditAction: string,
  ) {
    const role = roleByCode[roleCode];
    if (!role) throw new Error(`Missing role ${roleCode}`);

    const existingUser = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existingUser[0]) {
      console.log(`  skip ${email} (app user exists)`);
      return existingUser[0].id;
    }

    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password: DEV_SEED_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (error || !created.user) {
      // Auth user may exist without app row — try list
      const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
      const found = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
      if (!found) throw new Error(`Could not create auth user ${email}: ${error?.message}`);
      await db.insert(users).values({
        id: found.id,
        firmId,
        email,
        fullName,
        roleId: role.id,
        isActive: true,
      });
      console.log(`  linked ${email} → ${roleCode}`);
      await db.insert(auditLogs).values({
        firmId,
        userId: found.id,
        action: auditAction,
        entityType: "user",
        entityId: found.id,
        metadataJson: { email, roleCode, source: "dev_seed" },
      });
      return found.id;
    }

    await db.insert(users).values({
      id: created.user.id,
      firmId,
      email,
      fullName,
      roleId: role.id,
      isActive: true,
    });
    console.log(`  created ${email} → ${roleCode}`);
    await db.insert(auditLogs).values({
      firmId,
      userId: created.user.id,
      action: auditAction,
      entityType: "user",
      entityId: created.user.id,
      metadataJson: { email, roleCode, source: "dev_seed" },
    });
    return created.user.id;
  }

  console.log("Seeding pilot firm staff users…");
  for (const def of PILOT_FIRM_DEV_USERS) {
    await upsertDevUser(pilotFirm.id, def.email, def.fullName, def.roleCode, "dev.seed_user");
  }

  console.log("Seeding isolation test firm…");
  let isolationFirm = await db
    .select()
    .from(firms)
    .where(eq(firms.slug, ISOLATION_FIRM.slug))
    .limit(1);

  if (!isolationFirm[0]) {
    const [created] = await db
      .insert(firms)
      .values({
        name: ISOLATION_FIRM.name,
        slug: ISOLATION_FIRM.slug,
        status: "demo",
        isDemo: true,
        defaultCurrency: "USD",
      })
      .returning();
    isolationFirm = [created!];
    console.log(`  created firm ${ISOLATION_FIRM.name}`);
  } else {
    console.log(`  firm exists ${ISOLATION_FIRM.name}`);
  }

  const isoFirm = isolationFirm[0]!;
  await upsertDevUser(
    isoFirm.id,
    ISOLATION_FIRM.mpEmail,
    ISOLATION_FIRM.mpName,
    "managing_partner",
    "dev.seed_isolation_firm",
  );

  await db.insert(auditLogs).values({
    firmId: isoFirm.id,
    action: "dev.seed_isolation_marker",
    entityType: "firm",
    entityId: isoFirm.id,
    metadataJson: { note: "Tenant isolation fixture for P0-11 smoke tests" },
  });

  await sql.end({ timeout: 5 });
  console.log("\nDev user seed complete. See docs/DEV_SEEDS.md for credentials.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
