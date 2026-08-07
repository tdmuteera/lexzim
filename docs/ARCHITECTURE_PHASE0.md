# LexZim Phase 0 architecture snapshot

Phase 0 delivers hosted web foundations for the LexZim multi-tenant LPMS Core platform. It intentionally stops before Phase 1 domain CRUD.

## Scope delivered

- Next.js App Router web app with TPfigu visual theme pack
- Supabase integration (Postgres, Auth, Storage-ready)
- Drizzle schema + migrations
- Multi-tenant model (`firms`, `users.firm_id`, tenant isolation rule)
- Supabase Auth server flows (setup, login, logout, session)
- RBAC engine and permission-gated navigation/routes
- Development seed users and smoke tests

## High-level runtime

```text
Browser
  -> Next.js App Router (Railway)
    -> Route Handlers / Server Components
      -> Supabase Auth cookies (via @supabase/ssr + proxy.ts)
      -> Drizzle + postgres.js
        -> Supabase Postgres
```

## Folder map

```text
app/
  (auth)/login, setup            # P0-09 auth UI routes
  (platform)/*                   # Shell pages (permission guarded)
  api/*                          # Health, auth, audit/staff examples, platform stub
components/
  auth/                          # AuthProvider, forms, Can, RouteGuard
  shell/                         # AppShell, sidebar, topbar, access denied
lib/
  auth/                          # service/session/audit/password helpers
  db/                            # schema + client
  rbac/                          # matrix, guards, route access helpers
  firm/, tenant/, platform/      # branding, scope helpers, platform admin foundations
scripts/
  seed-rbac, seed-dev-users, seed-demo-firm, phase0-smoke
docs/
  AUTH, RBAC, NAV_RBAC, DATABASE, DEV_SEEDS, PHASE0_SMOKE_TEST, TENANT_ARCHITECTURE
```

## Auth flow

1. `proxy.ts` refreshes Supabase auth cookies per request.
2. Root route gate:
   - empty DB: `/setup`
   - no session: `/login`
   - valid session: `/dashboard`
3. `authCurrentUser()` loads app user + firm + role + permissions.
4. `requireSession()` and permission guards protect APIs/pages.

## Tenant model

- Product name: **LexZim**
- Platform model: **LPMS Core** (multi-tenant)
- First-run setup creates tenant #1 only (empty DB bootstrap)
- Additional tenants created via platform admin foundation (`platformCreateFirm`)
- Demo tenant is another firm row (`is_demo=true`), not another app

## Isolation rules

- Every firm-scoped table uses `firm_id`
- Every firm-scoped query filters by session firm
- Never trust client-provided firm id without scope check
- RLS hardening is deferred to later scale phase

## Extension points for Phase 1

- Add domain tables (`clients`, `matters`, etc.) with `firm_id`
- Use `tenantFirmId(session)` in repositories
- Store files under `firms/{firm_id}/...` in Supabase Storage
- Keep route permission metadata in `lib/nav.ts`

## Out of scope in Phase 0

- Clients/matters CRUD
- Template merge engine and document generation
- AI workflows and embeddings usage
- Full billing/trust engine
- Subscriptions and platform billing