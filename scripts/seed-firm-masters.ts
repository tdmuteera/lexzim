/**
 * DEV / ops: ensure every firm has a Managing Partner "master" account
 * for LexZim testing and key additions.
 *
 * Usage:
 *   DEV_SEED_ENABLED=1 npx tsx scripts/seed-firm-masters.ts
 *
 * Email pattern: devops@{firm-slug}.lexzim.local
 * Password: shared (printed at end). Prefer resetting after pilots.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { auditLogs, firms, roles, users } from "../lib/db/schema";

config({ path: ".env.local" });

/** Shared master password for local / pilot DevOps accounts. Change after sharing. */
export const FIRM_MASTER_PASSWORD = "<set-in-env>";

function assertAllowed() {
  if (process.env.DEV_SEED_ENABLED !== "1") {
    console.error("Set DEV_SEED_ENABLED=1 to run firm master seed.");
    process.exit(1);
  }
  if (process.env.NODE_ENV === "production") {
    console.error("Refusing to seed firm masters in production.");
    process.exit(1);
  }
}

function masterEmailForSlug(slug: string): string {
  const safe = slug
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `devops@${safe || "firm"}.lexzim.local`;
}

async function main() {
  assertAllowed();

  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !supabaseUrl || !serviceKey) {
    throw new Error("DATABASE_URL/DIRECT_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY required.");
  }

  const sql = postgres(url, { ssl: "require", prepare: false, max: 1 });
  const db = drizzle(sql);
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const mpRole = (
    await db.select().from(roles).where(eq(roles.code, "managing_partner")).limit(1)
  )[0];
  if (!mpRole) {
    throw new Error("managing_partner role missing. Run npm run db:seed:rbac first.");
  }

  const allFirms = await db.select().from(firms).orderBy(firms.createdAt);
  if (!allFirms.length) {
    throw new Error("No firms found.");
  }

  console.log(`Seeding master accounts for ${allFirms.length} firm(s)…\n`);

  const created: Array<{
    firm: string;
    slug: string;
    email: string;
    status: string;
  }> = [];

  for (const firm of allFirms) {
    const email = masterEmailForSlug(firm.slug);
    const fullName = `LexZim DevOps (${firm.name})`;

    const existingApp = await db.select().from(users).where(eq(users.email, email)).limit(1);

    if (existingApp[0]) {
      // Ensure MP role + active + correct firm
      await db
        .update(users)
        .set({
          firmId: firm.id,
          roleId: mpRole.id,
          isActive: true,
          fullName,
        })
        .where(eq(users.id, existingApp[0].id));

      // Reset password so the shared secret is known
      await admin.auth.admin.updateUserById(existingApp[0].id, {
        password: FIRM_MASTER_PASSWORD,
        email_confirm: true,
      });

      created.push({ firm: firm.name, slug: firm.slug, email, status: "updated" });
      console.log(`  updated ${email} → ${firm.slug}`);
      continue;
    }

    const { data: authCreated, error } = await admin.auth.admin.createUser({
      email,
      password: FIRM_MASTER_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: fullName, purpose: "firm_master" },
    });

    let authId = authCreated?.user?.id;
    if (error || !authId) {
      const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
      const found = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
      if (!found) {
        console.error(`  FAIL ${email}: ${error?.message ?? "create failed"}`);
        created.push({ firm: firm.name, slug: firm.slug, email, status: "failed" });
        continue;
      }
      authId = found.id;
      await admin.auth.admin.updateUserById(authId, {
        password: FIRM_MASTER_PASSWORD,
        email_confirm: true,
      });
    }

    // Email might already belong to another firm row under a different id (unlikely)
    const clash = await db
      .select()
      .from(users)
      .where(and(eq(users.email, email)))
      .limit(1);

    if (clash[0]) {
      await db
        .update(users)
        .set({
          firmId: firm.id,
          roleId: mpRole.id,
          isActive: true,
          fullName,
        })
        .where(eq(users.id, clash[0].id));
    } else {
      await db.insert(users).values({
        id: authId,
        firmId: firm.id,
        email,
        fullName,
        roleId: mpRole.id,
        isActive: true,
      });
    }

    await db.insert(auditLogs).values({
      firmId: firm.id,
      userId: authId,
      action: "ops.seed_firm_master",
      entityType: "user",
      entityId: authId,
      metadataJson: { email, roleCode: "managing_partner", source: "seed_firm_masters" },
    });

    created.push({ firm: firm.name, slug: firm.slug, email, status: "created" });
    console.log(`  created ${email} → ${firm.slug}`);
  }

  await sql.end({ timeout: 5 });

  console.log("\n========== FIRM MASTER ACCOUNTS ==========");
  console.log(`Password (all): ${FIRM_MASTER_PASSWORD}`);
  console.log("Role: managing_partner (full firm permissions via RBAC matrix)\n");
  for (const row of created) {
    console.log(`${row.status.padEnd(8)}  ${row.email.padEnd(48)}  ${row.firm}`);
  }
  console.log("==========================================\n");
  console.log("Note: these are firm-scoped Managing Partners, not platform_admins.");
  console.log("For cross-firm ops console, also run: npm run ops:seed-admin -- --email=...");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
