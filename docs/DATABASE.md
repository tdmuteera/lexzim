# LexZim database notes (P0-05)

## Engine

- **PostgreSQL on Supabase** only (not SQLite / SQLCipher)
- ORM: **Drizzle**
- Driver: **postgres.js** with `ssl: 'require'`
- Env: `DATABASE_URL` in `.env.local` / Railway

## Connection tips

1. **Free tier direct DB host (`db.<ref>.supabase.co`) is often IPv6-only.** If Node fails with `ENOENT` / timeout, use the **Shared Pooler** URI from the Supabase **Connect** modal (do not guess `aws-0`; your project may be on `aws-1-…`).
2. Prefer:
   - `DATABASE_URL` = Transaction pooler (`…:6543`) for the Next.js app
   - `DIRECT_URL` = Session pooler (`…:5432`) for `drizzle-kit migrate`
3. Username format for pooler: `postgres.<project-ref>`
4. Always use SSL (`ssl: 'require'` in the driver).
5. URL-encode special characters in the password (`@` → `%40`).
6. Never commit `.env.local`. Never expose DB URLs to the browser.

## Scripts

```bash
npm run db:generate      # create SQL from lib/db/schema.ts
npm run db:migrate       # apply migrations to Supabase
npm run db:seed:rbac     # seed roles, permissions, matrix (P0-06)
npm run db:studio        # optional Drizzle Studio
```

Migrations live in `drizzle/migrations/`. Drizzle tracks applied migrations in its journal/`drizzle` meta tables.

## Schema status

- **P0-05:** `vector` (pgvector), `app_meta`
- **P0-06:** `firms`, `roles`, `permissions`, `role_permissions`, `users`, `firm_settings`, `audit_logs`
- **Tenant architecture:** `firms` extended (status, contact, logo, `is_demo`); `platform_admins`; see `docs/TENANT_ARCHITECTURE.md`
- **P1-01:** MVP tables (`clients`, `matters`, `documents`, `templates`, workflow tables); see `docs/PHASE1_SCHEMA.md`
- **P2-01:** AI tables (`ai_settings`, conversations/messages, knowledge_*, `ai_embeddings` pgvector, usage); see `docs/AI.md`

See `docs/RBAC.md` for the permission matrix. Users are created in P0-07 / P0-11, not in the RBAC seed.

## Smoke checks

- `GET /api/health` — env configured
- `GET /api/db-status` — connected, pgvector, app_meta present
- Supabase Table Editor: confirm `roles` (5), `permissions` (28), `role_permissions` populated

## Multi-tenant rule

Every firm-scoped table includes **`firm_id`**, and every query must filter by it.
