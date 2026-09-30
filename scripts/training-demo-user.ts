/**
 * Create or reset the reusable training demo user and its fictional sample data.
 *
 * Everything lives in a separate demo tenant ("Training Demo Firm", is_demo = true), so no real
 * firm, client or finance data is read, changed or shown. The database is shared with the live
 * site, so the script refuses to touch any firm that is not the training firm.
 *
 * The password is kept in .env.demo-user (git-ignored by the ".env.*" rule). It is generated on
 * first run and reused afterwards.
 *
 *   npx tsx scripts/training-demo-user.ts            create or reset user and sample data
 *   npx tsx scripts/training-demo-user.ts --remove   delete the training firm and its login
 */
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";

const require = createRequire(import.meta.url);
{
  const so = require.resolve("server-only");
  require.cache[so] = { id: so, filename: so, loaded: true, exports: {} } as NodeModule;
}
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const FIRM_SLUG = "training-demo-firm";
const FIRM_NAME = "Training Demo Firm";
const DEMO_EMAIL = "training.demo@tpfigu.local";
const DEMO_NAME = "Tendai Demo";
const DEMO_ROLE = "junior_associate";
const CRED_FILE = resolve(process.cwd(), ".env.demo-user");

function loadOrCreatePassword(): string {
  if (existsSync(CRED_FILE)) {
    const m = /^DEMO_USER_PASSWORD=(.+)$/m.exec(readFileSync(CRED_FILE, "utf8"));
    if (m?.[1]) return m[1].trim();
  }
  const password = `Demo-${randomBytes(9).toString("base64url")}`;
  writeFileSync(
    CRED_FILE,
    [
      "# Training demo user (fictional, Training Demo Firm only). Never commit this file.",
      "# Recreate or reset: npx tsx scripts/training-demo-user.ts",
      `DEMO_USER_EMAIL=${DEMO_EMAIL}`,
      `DEMO_USER_PASSWORD=${password}`,
      "",
    ].join("\n"),
  );
  return password;
}

function localToday(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function main() {
  const remove = process.argv.includes("--remove");
  const { getDb } = await import("@/lib/db");
  const s = await import("@/lib/db/schema");
  const { and, eq } = await import("drizzle-orm");
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { copyRolePermissionsToUser } = await import("@/lib/rbac/repository");
  const { ensureTrialLicence } = await import("@/lib/repos/licences");
  const { writeAuditLog } = await import("@/lib/auth/audit");
  const { createMyDayItem, setMyDayItemStatus } = await import("@/lib/repos/my-day");
  const { addDays } = await import("@/lib/my-day/shared");

  const db = getDb();
  const supabase = createAdminClient();

  const [existingFirm] = await db.select().from(s.firms).where(eq(s.firms.slug, FIRM_SLUG)).limit(1);
  if (existingFirm && !existingFirm.isDemo) throw new Error("Firm slug is taken by a non-demo firm. Stopping.");

  const [existingUser] = await db.select().from(s.users).where(eq(s.users.email, DEMO_EMAIL)).limit(1);
  if (existingUser && existingUser.firmId !== existingFirm?.id) {
    throw new Error("The demo email belongs to a user outside the training firm. Stopping.");
  }

  if (remove) {
    if (existingUser) await supabase.auth.admin.deleteUser(existingUser.id).catch(() => undefined);
    if (existingFirm) await db.delete(s.firms).where(eq(s.firms.id, existingFirm.id));
    console.log("Training firm and demo login removed.");
    return;
  }

  const password = loadOrCreatePassword();

  const firm =
    existingFirm ??
    (
      await db
        .insert(s.firms)
        .values({
          name: FIRM_NAME,
          slug: FIRM_SLUG,
          status: "demo",
          isDemo: true,
          defaultCurrency: "USD",
          city: "Harare",
          country: "Zimbabwe",
        })
        .returning()
    )[0]!;
  await ensureTrialLicence(firm.id, { issuedBy: "script:training-demo-user", notes: "Training demo firm" });

  const [role] = await db.select().from(s.roles).where(eq(s.roles.code, DEMO_ROLE)).limit(1);
  if (!role) throw new Error(`Role ${DEMO_ROLE} not found.`);

  let userId = existingUser?.id;
  if (!userId) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: DEMO_EMAIL,
      password,
      email_confirm: true,
      user_metadata: { full_name: DEMO_NAME },
    });
    if (error || !data.user) throw new Error(`Could not create demo login: ${error?.message}`);
    userId = data.user.id;
    try {
      await db.insert(s.users).values({
        id: userId,
        firmId: firm.id,
        email: DEMO_EMAIL,
        fullName: DEMO_NAME,
        jobTitle: "Associate (training demo account)",
        roleId: role.id,
        isActive: true,
        isSystemUser: true,
        isLawyer: true,
        isTestUser: true,
        mustChangePassword: false,
      });
      await copyRolePermissionsToUser(userId, firm.id, role.id);
    } catch (e) {
      await supabase.auth.admin.deleteUser(userId).catch(() => undefined);
      throw e;
    }
    await writeAuditLog({
      action: "users.create",
      firmId: firm.id,
      userId,
      entityType: "user",
      entityId: userId,
      metadata: { email: DEMO_EMAIL, fullName: DEMO_NAME, source: "script:training-demo-user" },
    });
  } else {
    const { error } = await supabase.auth.admin.updateUserById(userId, { password });
    if (error) throw new Error(`Could not reset demo password: ${error.message}`);
    await db
      .update(s.users)
      .set({ isActive: true, mustChangePassword: false, updatedAt: new Date() })
      .where(eq(s.users.id, userId));
  }

  const owner = and(eq(s.myDayItems.firmId, firm.id), eq(s.myDayItems.userId, userId));
  await db.delete(s.myDayItems).where(owner);
  await db
    .delete(s.myDayRecurrences)
    .where(and(eq(s.myDayRecurrences.firmId, firm.id), eq(s.myDayRecurrences.userId, userId)));
  await db.delete(s.myDayPrefs).where(and(eq(s.myDayPrefs.firmId, firm.id), eq(s.myDayPrefs.userId, userId)));
  await db.delete(s.calendarEvents).where(eq(s.calendarEvents.firmId, firm.id));
  await db.delete(s.matters).where(eq(s.matters.firmId, firm.id));
  await db.delete(s.clients).where(eq(s.clients.firmId, firm.id));

  const clientRows = await db
    .insert(s.clients)
    .values([
      { firmId: firm.id, clientNumber: "CL0001", clientType: "individual", firstName: "Tariro", surname: "Moyo", fullName: "Tariro Moyo" },
      { firmId: firm.id, clientNumber: "CL0002", clientType: "corporate", fullName: "Kudu Properties (Pvt) Ltd", legalName: "Kudu Properties (Pvt) Ltd" },
      { firmId: firm.id, clientNumber: "CL0003", clientType: "individual", firstName: "Rudo", surname: "Sibanda", fullName: "Mr and Mrs Sibanda" },
    ])
    .returning({ id: s.clients.id, n: s.clients.clientNumber });
  const cid = (n: string) => clientRows.find((c) => c.n === n)!.id;
  const matterRows = await db
    .insert(s.matters)
    .values([
      { firmId: firm.id, clientId: cid("CL0001"), title: "Moyo v Chikomo", areaOfLaw: "Litigation", status: "open", matterNumber: "TD-0001", courtName: "High Court", responsibleLawyerId: userId, createdBy: userId },
      { firmId: firm.id, clientId: cid("CL0002"), title: "Lease: Kudu Properties", areaOfLaw: "Commercial", status: "open", matterNumber: "TD-0002", responsibleLawyerId: userId, createdBy: userId },
      { firmId: firm.id, clientId: cid("CL0003"), title: "Transfer: Stand 4521 Borrowdale", areaOfLaw: "Conveyancing", status: "open", matterNumber: "TD-0003", responsibleLawyerId: userId, createdBy: userId },
    ])
    .returning({ id: s.matters.id, n: s.matters.matterNumber });
  const mid = (n: string) => matterRows.find((m) => m.n === n)!.id;

  const today = localToday();
  const yesterday = addDays(today, -1);
  type Seed = {
    title: string;
    dueDate: string | null;
    dueTime?: string;
    tag?: string;
    starred?: boolean;
    notes?: string;
    clientId?: string;
    matterId?: string;
  };
  const add = async (x: Seed, asOf = today) => {
    const r = await createMyDayItem(
      firm.id,
      userId!,
      {
        title: x.title,
        notes: x.notes ?? null,
        dueDate: x.dueDate,
        dueTime: x.dueTime ?? null,
        tag: x.tag ?? null,
        starred: x.starred ?? false,
        clientId: x.clientId ?? null,
        matterId: x.matterId ?? null,
      },
      null,
      asOf,
    );
    return r.itemId!;
  };

  const doneYesterday = await add({ title: "Send engagement letter: Kudu Properties", dueDate: yesterday, tag: "client" }, yesterday);
  await setMyDayItemStatus(firm.id, userId, doneYesterday, "done", yesterday);
  const doneYesterday2 = await add({ title: "Update fee note register", dueDate: yesterday, tag: "admin" }, yesterday);
  await setMyDayItemStatus(firm.id, userId, doneYesterday2, "done", yesterday);
  await add({ title: "Collect title deeds from Deeds Office", dueDate: yesterday, tag: "client" }, yesterday);

  await add({
    title: "File heads of argument: Moyo v Chikomo (High Court)",
    dueDate: today,
    dueTime: "10:00",
    tag: "client",
    starred: true,
    clientId: cid("CL0001"),
    matterId: mid("TD-0001"),
  });
  await add({
    title: "Call client re transfer duty: Stand 4521 Borrowdale",
    dueDate: today,
    dueTime: "14:00",
    tag: "client",
    clientId: cid("CL0003"),
    matterId: mid("TD-0003"),
  });
  await add({ title: "Prepare invoice: Mr and Mrs Sibanda", dueDate: today, tag: "finance", clientId: cid("CL0003") });
  await add({ title: "Draft lease agreement: Kudu Properties", dueDate: addDays(today, 1), tag: "client", matterId: mid("TD-0002") });
  await add({ title: "Diarise prescription date: Ncube matter", dueDate: addDays(today, 3), tag: "admin", starred: true });
  await add({ title: "Renew practising certificate", dueDate: addDays(today, 6), tag: "personal" });
  await add({ title: "Read the new Deeds Registries practice note", dueDate: null, tag: "admin" });

  const at = (hhmm: string, d = today) => new Date(`${d}T${hhmm}:00+02:00`);
  await db.insert(s.calendarEvents).values([
    { firmId: firm.id, eventType: "appointment", title: "Client consultation: Tariro Moyo", startsAt: at("09:00"), endsAt: at("09:45"), clientId: cid("CL0001"), createdBy: userId, visibility: "private" },
    { firmId: firm.id, eventType: "hearing", title: "Court appearance: Moyo v Chikomo (High Court)", startsAt: at("11:30"), endsAt: at("12:30"), matterId: mid("TD-0001"), location: "High Court, Harare", createdBy: userId, visibility: "private" },
    { firmId: firm.id, eventType: "other", title: "Team meeting", startsAt: at("15:00"), endsAt: at("15:30"), createdBy: userId, visibility: "private" },
  ]);

  console.log(
    JSON.stringify(
      { firm: firm.name, firmId: firm.id, user: DEMO_EMAIL, userId, role: DEMO_ROLE, today, credentials: ".env.demo-user" },
      null,
      2,
    ),
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
