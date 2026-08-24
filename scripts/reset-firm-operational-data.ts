/**
 * Reset operational data for one firm (fresh testing start).
 *
 * Keeps: firm row, staff users (optional demo purge), user_permissions,
 * firm_licences, firm_settings (banking/letterhead kept; counters reset),
 * ai_settings, gl_accounts, firm_services, deadline_templates, hr_leave_types,
 * firm_holidays.
 *
 * Usage:
 *   npx tsx scripts/reset-firm-operational-data.ts --slug=t-pfigu-attorneys --confirm="RESET FIRM DATA"
 *   npx tsx scripts/reset-firm-operational-data.ts --slug=t-pfigu-attorneys --confirm="RESET FIRM DATA" --remove-demo-users
 *   npx tsx scripts/reset-firm-operational-data.ts --slug=t-pfigu-attorneys --dry-run
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

config({ path: ".env.local" });

const CONFIRM_PHRASE = "RESET FIRM DATA";

/** Tables with firm_id that we keep as firm infrastructure. */
const KEEP_TABLES = new Set([
  "users",
  "user_permissions",
  "firm_settings",
  "firm_licences",
  "ai_settings",
  "firm_ai_proxy",
  "gl_accounts",
  "firm_services",
  "deadline_templates",
  "hr_leave_types",
  "firm_holidays",
]);

/** Prefer wiping these before parents that use ON DELETE RESTRICT. */
const DELETE_ORDER_HINT = [
  "quotation_lines",
  "quotations",
  "invoice_lines",
  "fee_payments",
  "invoices",
  "time_entries",
  "disbursements",
  "gl_journal_lines",
  "gl_journal_entries",
  "creditor_payments",
  "creditor_invoices",
  "creditors",
  "petty_cash_movements",
  "petty_cash_floats",
  "business_cashbook_entries",
  "firm_expenses",
  "finance_reconciliation_runs",
  "finance_period_locks",
  "trust_ledger_entries",
  "trust_vault_bank_ins",
  "trust_vault_counts",
  "trust_accounts",
  "document_portal_shares",
  "matter_portal_shares",
  "portal_inbox_uploads",
  "portal_magic_links",
  "portal_users",
  "documents",
  "template_versions",
  "templates",
  "ai_messages",
  "ai_conversations",
  "ai_embeddings",
  "ai_jobs",
  "ai_usage_events",
  "knowledge_chunks",
  "knowledge_sources",
  "calendar_events",
  "matter_deadlines",
  "matter_events",
  "matter_team",
  "pending_procedures",
  "related_parties",
  "conflict_checks",
  "intakes",
  "staff_notifications",
  "staff_sessions",
  "password_reset_requests",
  "hr_leave_requests",
  "hr_contracts",
  "hr_staff_profiles",
  "firm_assets",
  "audit_logs",
  "matters",
  "clients",
];

function arg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function deleteFirmStoragePrefix(firmId: string): Promise<number> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.warn("Skipping storage wipe: missing Supabase admin env.");
    return 0;
  }
  const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim() || "firm-files";
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const root = `firms/${firmId}`;
  let removed = 0;

  async function walk(path: string) {
    const { data, error } = await admin.storage.from(bucket).list(path, { limit: 1000 });
    if (error) throw new Error(`Storage list failed: ${error.message}`);
    const entries = data ?? [];
    const filePaths: string[] = [];
    for (const entry of entries) {
      const full = `${path}/${entry.name}`;
      if (entry.id == null) await walk(full);
      else filePaths.push(full);
    }
    for (let i = 0; i < filePaths.length; i += 100) {
      const batch = filePaths.slice(i, i + 100);
      const { error: rmErr } = await admin.storage.from(bucket).remove(batch);
      if (rmErr) throw new Error(`Storage delete failed: ${rmErr.message}`);
      removed += batch.length;
    }
  }

  try {
    await walk(root);
  } catch (err) {
    console.warn(
      `Storage wipe warning: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return removed;
}

async function main() {
  const slug = arg("slug")?.trim();
  const confirm = arg("confirm")?.trim();
  const dryRun = hasFlag("dry-run");
  const removeDemoUsers = hasFlag("remove-demo-users");

  if (!slug) {
    console.error("Required: --slug=<firm-slug>");
    process.exit(1);
  }
  if (!dryRun && confirm !== CONFIRM_PHRASE) {
    console.error(`Required: --confirm="${CONFIRM_PHRASE}" (or pass --dry-run)`);
    process.exit(1);
  }

  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("DIRECT_URL or DATABASE_URL required");

  const sql = postgres(url, { max: 1, ssl: "require" });

  const firms = await sql<{ id: string; name: string; slug: string }[]>`
    SELECT id, name, slug FROM firms WHERE slug = ${slug} LIMIT 1
  `;
  const firm = firms[0];
  if (!firm) {
    console.error(`Firm not found for slug=${slug}`);
    await sql.end();
    process.exit(1);
  }

  const isolation = await sql<{ id: string; clients: number; matters: number }[]>`
    SELECT f.id,
      (SELECT count(*)::int FROM clients c WHERE c.firm_id = f.id) AS clients,
      (SELECT count(*)::int FROM matters m WHERE m.firm_id = f.id) AS matters
    FROM firms f
    WHERE f.slug = 'isolation-test-firm'
    LIMIT 1
  `;

  const tables = await sql<{ table_name: string }[]>`
    SELECT DISTINCT tc.table_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND kcu.column_name = 'firm_id'
      AND kcu.table_name <> 'firms'
    ORDER BY tc.table_name
  `;

  const wipeTables = tables
    .map((t) => t.table_name)
    .filter((t) => !KEEP_TABLES.has(t));

  const ordered = [
    ...DELETE_ORDER_HINT.filter((t) => wipeTables.includes(t)),
    ...wipeTables.filter((t) => !DELETE_ORDER_HINT.includes(t)),
  ];

  console.log(`Firm: ${firm.name} (${firm.slug}) id=${firm.id}`);
  console.log(`Mode: ${dryRun ? "DRY RUN" : "EXECUTE"}`);
  console.log(`Tables to wipe: ${ordered.length}`);

  const before: Record<string, number> = {};
  for (const table of ordered) {
    const rows = await sql.unsafe(
      `SELECT count(*)::int AS n FROM "${table}" WHERE firm_id = $1`,
      [firm.id],
    );
    before[table] = Number(rows[0]?.n ?? 0);
  }
  const nonEmpty = Object.entries(before).filter(([, n]) => n > 0);
  console.log("Non-empty wipe targets:");
  for (const [table, n] of nonEmpty) console.log(`  ${table}: ${n}`);

  const demoUsers = await sql<{ id: string; email: string; full_name: string }[]>`
    SELECT id, email, full_name
    FROM users
    WHERE firm_id = ${firm.id}
      AND email ILIKE '%@lexzim.local'
      AND email NOT ILIKE 'devops@%'
  `;
  if (removeDemoUsers) {
    console.log(`Demo users to remove: ${demoUsers.length}`);
    for (const u of demoUsers) console.log(`  ${u.email}`);
  }

  if (dryRun) {
    console.log("Dry run only. No changes made.");
    await sql.end();
    return;
  }

  const deleted: Record<string, number> = {};
  const remaining = [...ordered];
  let guard = 0;
  while (remaining.length && guard < 20) {
    guard += 1;
    const nextPass = [...remaining];
    remaining.length = 0;
    for (const table of nextPass) {
      try {
        const result = await sql.unsafe(
          `DELETE FROM "${table}" WHERE firm_id = $1`,
          [firm.id],
        );
        deleted[table] = Number(result.count ?? 0);
        console.log(`Deleted ${deleted[table]} from ${table}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/violates foreign key|restrict/i.test(msg)) {
          remaining.push(table);
        } else {
          throw err;
        }
      }
    }
  }
  if (remaining.length) {
    throw new Error(`Could not wipe tables (FK order): ${remaining.join(", ")}`);
  }

  // Reset numbering counters; keep banking / letterhead settings.
  await sql`
    UPDATE firm_settings
    SET value = '1', updated_at = NOW()
    WHERE firm_id = ${firm.id}
      AND key IN (
        'next_invoice_number',
        'next_receipt_number',
        'next_trust_ref_number',
        'next_client_number',
        'next_matter_number',
        'next_quote_number'
      )
  `;

  // Clear diagnostic firm linkage (events themselves retained for ops).
  await sql`
    UPDATE diagnostic_events
    SET firm_id = NULL
    WHERE firm_id = ${firm.id}
  `;

  let authDeleted = 0;
  if (removeDemoUsers && demoUsers.length) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      throw new Error("Cannot remove demo users without Supabase service role.");
    }
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    for (const u of demoUsers) {
      await sql`DELETE FROM user_permissions WHERE user_id = ${u.id}`;
      await sql`DELETE FROM users WHERE id = ${u.id} AND firm_id = ${firm.id}`;
      await admin.auth.admin.deleteUser(u.id).catch(() => undefined);
      authDeleted += 1;
      console.log(`Removed demo user ${u.email}`);
    }
  }

  const storageRemoved = await deleteFirmStoragePrefix(firm.id);
  console.log(`Storage objects removed: ${storageRemoved}`);

  const afterClients = await sql`
    SELECT count(*)::int AS n FROM clients WHERE firm_id = ${firm.id}
  `;
  const afterMatters = await sql`
    SELECT count(*)::int AS n FROM matters WHERE firm_id = ${firm.id}
  `;
  const afterInvoices = await sql`
    SELECT count(*)::int AS n FROM invoices WHERE firm_id = ${firm.id}
  `;
  const afterUsers = await sql`
    SELECT email, full_name, r.code AS role
    FROM users u
    JOIN roles r ON r.id = u.role_id
    WHERE u.firm_id = ${firm.id}
    ORDER BY u.email
  `;

  const isolationAfter = await sql<{ id: string; clients: number; matters: number }[]>`
    SELECT f.id,
      (SELECT count(*)::int FROM clients c WHERE c.firm_id = f.id) AS clients,
      (SELECT count(*)::int FROM matters m WHERE m.firm_id = f.id) AS matters
    FROM firms f
    WHERE f.slug = 'isolation-test-firm'
    LIMIT 1
  `;

  if (isolation[0] && isolationAfter[0]) {
    if (
      isolation[0].clients !== isolationAfter[0].clients ||
      isolation[0].matters !== isolationAfter[0].matters
    ) {
      throw new Error("Isolation Test Firm counts changed — aborting integrity check failed.");
    }
    console.log(
      `Isolation untouched: clients=${isolationAfter[0].clients} matters=${isolationAfter[0].matters}`,
    );
  }

  console.log("\nT Pfigu after reset:");
  console.log(`  clients=${afterClients[0]?.n ?? 0}`);
  console.log(`  matters=${afterMatters[0]?.n ?? 0}`);
  console.log(`  invoices=${afterInvoices[0]?.n ?? 0}`);
  console.log(`  staff remaining=${afterUsers.length} (demo auth deleted=${authDeleted})`);
  for (const u of afterUsers) {
    console.log(`    ${u.email} (${u.role})`);
  }

  await sql.end({ timeout: 5 });
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
