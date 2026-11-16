# LexZim security (Supabase + app)

## Model

LexZim is a **server-mediated** SaaS app:

1. Browser uses Supabase Auth (anon key) only for session cookies.
2. All business data goes through Next.js APIs on Railway.
3. APIs use Drizzle over `DATABASE_URL` (or the service role for Storage / Auth admin).
4. Tenant isolation is enforced in the app with `firm_id` and RBAC (`docs/TENANT_ARCHITECTURE.md`, `docs/RBAC.md`).

The browser must **not** read or write Postgres tables through the Supabase Data API (PostgREST).

## Data API lockdown (migration `0058_supabase_data_api_lockdown`)

Applied on the Supabase project to clear the security advisor findings:

| Control | Effect |
|---|---|
| `REVOKE` table/sequence/function privileges from `anon` and `authenticated` | PostgREST cannot CRUD public tables with the anon key |
| `REVOKE USAGE` on schema `public` from `anon` / `authenticated` | Browser JWT roles cannot see the public schema |
| `ALTER DEFAULT PRIVILEGES … REVOKE` | New tables do not inherit Data API grants (also covers Supabase’s 30 Oct 2026 grant change) |
| `ENABLE ROW LEVEL SECURITY` on all public tables, **no** open policies | Deny-by-default for JWT roles even if a grant is re-added by mistake |
| Storage bucket `firm-files` forced private; broad `storage.objects` policies dropped | Files only via LexZim APIs + service role signed URLs |

Drizzle and `service_role` keep working. Do **not** add “allow all authenticated” RLS policies unless you intentionally redesign around PostgREST.

### Verify

```bash
npm run security:verify-data-api
```

Expect: no `anon`/`authenticated` table grants, every public table has RLS, REST probe with the anon key is denied.

Also re-check **Supabase → Advisors** after the migration. Critical “RLS disabled” / “sensitive columns exposed” should clear once the Data API cannot reach those tables.

### App-layer tenancy proof (not PostgREST RLS)

LexZim keeps business data off the Data API. Tenant isolation is still enforced in Next.js + Drizzle with `firm_id`. Before a commercial release:

```bash
# Static: repos/API routes that forget firm scope
npm run security:check-firm-scope

# Lockdown + static checks (add RELEASE_MIGRATE=1 to run drizzle-kit migrate first)
npm run security:release-gate

# Runtime IDOR matrix (needs running app + pilot + isolation@lexzim.local)
npm run smoke:tenant-isolation
```

Do **not** “fix” multi-tenancy by opening `anon`/`authenticated` grants and adding per-firm PostgREST policies. That fights this lockdown model.

## Bank inbox (CSV)

Statement CSV import (`/finance/bank-inbox`, migration `0059`) stays on the Next.js + Drizzle path. New tables enable RLS with no Data API policies. Trust CSV lines may only **match** existing trust ledger entries; they never invent client-tagged trust receipts.

## App hardening (related)

- Security headers in `next.config.ts` (HSTS, frame deny helpers, COOP, CORP, Permissions-Policy, CSP **Report-Only**)
- Staff login rate limit on `POST /api/auth/login` (per IP)
- Portal auth rate limit (see `docs/cloud/PORTAL_AUTH.md`)
- Staff idle timeout (`lib/auth/idle-timeout.ts`)
- Storage paths under `firms/{firm_id}/…` with server-side checks (`docs/FILES.md`)

## Operator checklist

1. Never put `SUPABASE_SERVICE_ROLE_KEY` or `DATABASE_URL` in client bundles.
2. Rotate the anon key only with a planned redeploy (`docs/PRODUCTION_SECRETS.md`).
3. After creating tables in SQL, do not `GRANT` them to `anon` unless you mean to expose them on the Data API.
4. Prefer Supabase Advisors + `scripts/verify-data-api-lockdown.ts` after schema changes.
5. Keep Railway and Supabase on paid tiers before live client data if you need PITR and always-on (`docs/cloud/OPS_RUNBOOK.md`).
