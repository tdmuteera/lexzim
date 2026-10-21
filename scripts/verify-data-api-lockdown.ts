/**
 * Confirms public tables are not readable via the anon Data API, and that RLS is on.
 *   npx tsx scripts/verify-data-api-lockdown.ts
 */
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { config } from "dotenv";

const require = createRequire(import.meta.url);
const so = require.resolve("server-only");
require.cache[so] = { id: so, filename: so, loaded: true, exports: {} };
config({ path: resolve(process.cwd(), ".env.local") });

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const dbUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url || !anon) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or ANON_KEY");
  if (!dbUrl) throw new Error("Missing DATABASE_URL / DIRECT_URL");

  const postgres = (await import("postgres")).default;
  const sql = postgres(dbUrl, { max: 1, prepare: false, ssl: "require" });

  try {
    const rlsOff = await sql<{ tablename: string }[]>`
      SELECT c.relname AS tablename
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind IN ('r', 'p')
        AND NOT c.relrowsecurity
      ORDER BY 1
    `;
    const grants = await sql<{ grantee: string; table_name: string; privilege_type: string }[]>`
      SELECT grantee, table_name, privilege_type
      FROM information_schema.role_table_grants
      WHERE table_schema = 'public'
        AND grantee IN ('anon', 'authenticated')
      ORDER BY 1, 2, 3
    `;
    const schemaUsage = await sql<{ grantee: string }[]>`
      SELECT grantee::text AS grantee
      FROM information_schema.role_usage_grants
      WHERE object_schema = 'public'
        AND privilege_type = 'USAGE'
        AND grantee IN ('anon', 'authenticated')
    `;

    // Probe a real table if present.
    const probe = await sql<{ table_name: string }[]>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('firms', 'users', 'clients')
      ORDER BY table_name
      LIMIT 1
    `;
    const table = probe[0]?.table_name ?? "firms";
    const rest = await fetch(`${url}/rest/v1/${table}?select=*&limit=1`, {
      headers: {
        apikey: anon,
        Authorization: `Bearer ${anon}`,
        Accept: "application/json",
      },
    });
    const restBody = await rest.text();

    const okRest = rest.status === 401 || rest.status === 403 || /permission denied|not find the table|schema cache/i.test(restBody);
    const okRls = rlsOff.length === 0;
    const okGrants = grants.length === 0;

    console.log(
      JSON.stringify(
        {
          ok: okRest && okRls && okGrants,
          restStatus: rest.status,
          restSnippet: restBody.slice(0, 180),
          tablesWithoutRls: rlsOff.map((r) => r.tablename),
          anonAuthenticatedGrants: grants.length,
          schemaUsageForBrowserRoles: schemaUsage.map((r) => r.grantee),
        },
        null,
        2,
      ),
    );

    if (!okRest || !okRls || !okGrants) process.exit(1);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
