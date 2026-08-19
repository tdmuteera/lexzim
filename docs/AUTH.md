# LexZim Auth (P0-07)

Supabase Auth (email/password) linked to app `users` + `firms`. Login UI is **P0-09**.

## Model

- `auth.users.id` === `public.users.id` (UUID)
- Each app user belongs to one `firm_id` (tenant workspace)
- Session DTO includes firm (name, status, `is_demo`, logo URL), role, job title, and **effective** permission codes (per-person grants when present, otherwise the role matrix). See Phase 9 access in `docs/PHASE9_ADR.md`.
- Passwords never appear in audit logs or API error payloads

## Bootstrap vs platform growth

| State | Behavior |
|---|---|
| Empty database | `authNeedsSetup()` true → first-run creates **tenant #1** |
| Firms already exist | First-run disabled; new tenants via `platformCreateFirm()` (platform admin) |

See `docs/TENANT_ARCHITECTURE.md`.

## Flows

### 1. First-run (no firms yet)

`authNeedsSetup()` → `true` when `firms` is empty.

`authSetupFirm({ firmName, fullName, email, password })`:

1. Creates Supabase Auth user (email confirmed)
2. Inserts `firms` + Managing Partner `users` row
3. Writes `auth.setup_firm` audit event
4. Signs the browser/API client in (cookie session)

Requires RBAC seed (`npm run db:seed:rbac`) so `managing_partner` exists.

### 2. Login

`authLogin(email, password)` → `signInWithPassword`, loads app profile, updates `last_login_at`, audits `auth.login` / `auth.login_failed`.

### 3. Session

- Next.js 16 **`proxy.ts`** refreshes Supabase cookies via `lib/supabase/proxy.ts`
- `authCurrentUser()` / `requireSession()` for Server Components, Route Handlers, Server Actions
- Firm admin list/revoke of web sessions: see `docs/cloud/SESSION_ADMIN.md` (P5-08)

### 4. Logout

`authLogout()` → Supabase `signOut` + `auth.logout` audit when a profile was present.

## Password policy

Minimum **10** characters (`lib/auth/password.ts`).

## Manual test (dev)

With `npm run dev` and `.env.local` configured:

```bash
# Status
curl http://localhost:3000/api/auth/status

# First-run (only when needsSetup is true)
curl -X POST http://localhost:3000/api/auth/setup ^
  -H "Content-Type: application/json" ^
  -d "{\"firmName\":\"T Pfigu Attorneys\",\"fullName\":\"Managing Partner\",\"email\":\"mp@example.com\",\"password\":\"<set-in-env>\"}"

# Login
curl -c cookies.txt -X POST http://localhost:3000/api/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"mp@example.com\",\"password\":\"<set-in-env>\"}"

# Protected me
curl -b cookies.txt http://localhost:3000/api/auth/me

# Logout
curl -b cookies.txt -c cookies.txt -X POST http://localhost:3000/api/auth/logout
```

On PowerShell, prefer `Invoke-RestSession` / `Invoke-WebRequest` with `-SessionVariable` for cookies.

Check Supabase Auth → Users, Table Editor → `firms` / `users` / `audit_logs`.

## UI routes (P0-09)

| Path | Purpose |
|---|---|
| `/login` | Sign in |
| `/setup` | First-run bootstrap (empty platform only) |
| `/dashboard` | App shell (requires session) |

Manual test script: `docs/PHASE0_AUTH_UI_TEST.md`

## API map

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/auth/status` | `needsSetup` + current user |
| POST | `/api/auth/setup` | First-run bootstrap |
| POST | `/api/auth/login` | Sign in |
| POST | `/api/auth/logout` | Sign out |
| GET | `/api/auth/me` | `requireSession()` sample |

## Code map

| Path | Role |
|---|---|
| `lib/auth/service.ts` | Setup / login / logout |
| `lib/auth/session.ts` | Current user + requireSession |
| `lib/auth/audit.ts` | Audit helper |
| `lib/supabase/proxy.ts` | Cookie refresh |
| `proxy.ts` | Next.js 16 Proxy entry |

## Next

**P0-10:** Role-gated navigation and deep-link route guards complete.
