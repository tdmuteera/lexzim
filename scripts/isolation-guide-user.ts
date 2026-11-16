/**
 * One Isolation login for the module check. Managing partner rights.
 * Does not change any other user. Password stays in .env.guide-user.
 *
 *   npx tsx scripts/isolation-guide-user.ts
 */
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";

const require = createRequire(import.meta.url);
const so = require.resolve("server-only");
require.cache[so] = { id: so, filename: so, loaded: true, exports: {} };
config({ path: resolve(process.cwd(), ".env.local") });

const EMAIL = "guide.tester@lexzim.local";
const NAME = "Guide Tester";
const CRED_FILE = resolve(process.cwd(), ".env.guide-user");

function loadOrCreatePassword(): string {
  if (existsSync(CRED_FILE)) {
    const match = /^GUIDE_USER_PASSWORD=(.+)$/m.exec(readFileSync(CRED_FILE, "utf8"));
    if (match?.[1]) return match[1].trim();
  }
  const password = `Guide-${randomBytes(9).toString("base64url")}`;
  writeFileSync(
    CRED_FILE,
    [
      "# Isolation guide login only. Never commit this file.",
      `GUIDE_USER_EMAIL=${EMAIL}`,
      `GUIDE_USER_PASSWORD=${password}`,
      "",
    ].join("\n"),
    { flag: "wx" },
  );
  return password;
}

async function main() {
  const { getDb } = await import("../lib/db");
  const { firms, roles, users } = await import("../lib/db/schema");
  const { and, eq } = await import("drizzle-orm");
  const { createAdminClient } = await import("../lib/supabase/admin");
  const { copyRolePermissionsToUser } = await import("../lib/rbac/repository");

  const db = getDb();
  const firm = (
    await db.select().from(firms).where(eq(firms.slug, "isolation-test-firm")).limit(1)
  )[0];
  if (!firm) throw new Error("Isolation Test Firm was not found. Nothing was written.");

  const [existing] = await db.select().from(users).where(eq(users.email, EMAIL)).limit(1);
  if (existing && existing.firmId !== firm.id) {
    throw new Error("That email belongs to another firm. Nothing was written.");
  }

  const [role] = await db.select().from(roles).where(eq(roles.code, "managing_partner")).limit(1);
  if (!role) throw new Error("Managing partner role was not found. Nothing was written.");

  const password = loadOrCreatePassword();
  const supabase = createAdminClient();

  if (!existing) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: EMAIL,
      password,
      email_confirm: true,
      user_metadata: { full_name: NAME },
    });
    if (error || !data.user) throw new Error(error?.message || "Could not create the login.");
    try {
      await db.insert(users).values({
        id: data.user.id,
        firmId: firm.id,
        email: EMAIL,
        fullName: NAME,
        jobTitle: "Guide check",
        roleId: role.id,
        isActive: true,
        isSystemUser: true,
        isLawyer: true,
        isTestUser: true,
        mustChangePassword: false,
      });
      await copyRolePermissionsToUser(data.user.id, firm.id, role.id);
    } catch (err) {
      await supabase.auth.admin.deleteUser(data.user.id).catch(() => undefined);
      throw err;
    }
    console.log(JSON.stringify({ created: true, email: EMAIL, firm: firm.name, role: role.code }));
  } else {
    console.log(JSON.stringify({ created: false, email: EMAIL, firm: firm.name, role: role.code }));
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
