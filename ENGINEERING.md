# Engineering notes — LexZim

## Phase scope

| Phase | In scope | Out of scope for that phase |
|---|---|---|
| **0** | Next.js skeleton, TPfigu UI port, Railway/Supabase wiring, auth, RBAC, `firm_id`, placeholder routes | Clients/matters CRUD, AI, billing, calendar engines |
| **1+** | Practice MVP and later modules | Do not invent ahead of the phase prompts |

Work Phase 0 prompts in order (P0-01 → P0-12). Do not skip.

## Naming conventions

- React components: `PascalCase` (`AppSidebar.tsx`)
- Files for utilities: `camelCase` or kebab where Next.js expects (`route.ts`)
- Database: `snake_case` tables/columns
- Permission codes: `module.action` (e.g. `matters.view_all`)

## Multi-tenant rule

Every firm-scoped query must filter by `firm_id`. Never trust a client-supplied firm id without checking the session.

See **`docs/TENANT_ARCHITECTURE.md`** for LPMS Core platform model (LexZim product = multi-tenant SaaS; pilot firm is tenant #1).

## Platform vs firm

- **Firm workspace:** RBAC roles (`managing_partner`, etc.) — practice users
- **Platform admin:** `platform_admins` + `requirePlatformAdmin()` — LexZim operator, not a firm role
- **Bootstrap:** empty DB → first-run creates tenant #1; further firms → platform admin API (UI later)

## UI rule

Visual source of truth is the **T Pfigu Attorneys** HTML demo (cream/gold legal look). Do not redesign into a generic AI purple/navy dashboard.

## Secrets

- No secrets in the repo
- Use `.env.local` locally and Railway/Supabase env in deploy
- Only `NEXT_PUBLIC_*` values may reach the browser

## Package manager

npm is the documented choice for this repo unless the team switches to pnpm later and updates this file.
