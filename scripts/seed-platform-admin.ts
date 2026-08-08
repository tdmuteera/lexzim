/**
 * Insert or activate a platform_admins row for an existing Supabase auth user.
 *
 * Usage:
 *   npx tsx scripts/seed-platform-admin.ts --email=ops@example.com --name="Ops Admin"
 *
 * The auth user must already exist (sign up via staff login on a firm, or create in Supabase).
 * Platform admins do not need a firm users row, but sharing an auth UUID with a firm user is OK.
 */
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

function arg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

async function main() {
  const email = (arg("email") ?? "").trim().toLowerCase();
  const fullName = (arg("name") ?? "Platform Admin").trim();
  if (!email) {
    console.error("Usage: npx tsx scripts/seed-platform-admin.ts --email=ops@example.com --name=\"Ops\"");
    process.exit(1);
  }

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { getDb } = await import("@/lib/db");
  const { platformAdmins } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const user = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
  if (!user) {
    console.error(`No Supabase auth user with email ${email}. Create the account first.`);
    process.exit(1);
  }

  const db = getDb();
  const existing = await db
    .select()
    .from(platformAdmins)
    .where(eq(platformAdmins.id, user.id))
    .limit(1);

  if (existing[0]) {
    await db
      .update(platformAdmins)
      .set({ isActive: true, email, fullName })
      .where(eq(platformAdmins.id, user.id));
    console.log(`Updated platform admin ${email} (${user.id})`);
  } else {
    await db.insert(platformAdmins).values({
      id: user.id,
      email,
      fullName,
      isActive: true,
    });
    console.log(`Created platform admin ${email} (${user.id})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
