# Phase 0 smoke test checklist (P0-11)

Run locally with `npm run dev` and:

```powershell
npm run smoke:phase0
```

Optional: `SMOKE_BASE_URL=https://your-railway-url` for deploy smoke.

## Automated checks (`npm run smoke:phase0`)

| # | Check | Expected |
|---|---|---|
| 1 | `GET /api/health` | `ok: true` |
| 2 | `GET /api/db-status` | `connected: true` |
| 3 | MP login `mp@lexzim.local` | 200 |
| 4 | `GET /api/auth/me` | `managing_partner` |
| 5 | `GET /api/audit` firm scope | No other `firm_id` in rows |
| 6 | Logout | 200 |
| 7 | Secretary login | 200 (after dev seed) |
| 8 | Secretary `GET /api/audit` | 403 forbidden |
| 9 | Secretary `ai.use` in session | permission present |

**Last run:** 2026-08-06 local — **9/9 PASS** (`npm run smoke:phase0` after `db:seed:dev-users`).

## Manual checklist

### 1. Fresh setup → Managing Partner

- [ ] Empty DB → `/setup` wizard
- [ ] Creates firm + MP → lands on dashboard

(Your environment already has T Pfigu Attorneys; skip if not resetting DB.)

### 2. Seed roles → login as each → sidebar matches NAV_RBAC

```powershell
$env:DEV_SEED_ENABLED = "1"
npm run db:seed:dev-users
```

| User | Expected sidebar highlights |
|---|---|
| `mp@lexzim.local` | All modules |
| `senior@lexzim.local` | No Staff, Settings; has Audit, Billing |
| `junior@lexzim.local` | Practice + AI; no Billing, Staff, Reports, Audit, Settings |
| `secretary@lexzim.local` | Practice + AI; no Billing, Staff, Reports, Audit, Settings |
| `accounts@lexzim.local` | Billing, Reports, AI; no Documents, Calendar, Intake, Audit, Staff, Settings |

### 3. Logout / login cycle

- [ ] Sign out → `/login`
- [ ] Sign in again → dashboard

### 4. Forbidden route

- [ ] As Secretary, open `/audit` → Access denied page

### 5. Tenant isolation

- [ ] MP `GET /api/audit` returns only T Pfigu `firm_id` rows
- [ ] Isolation firm exists (`isolation-test-firm`) with separate MP `isolation@lexzim.local`

### 6. Health endpoints

- [ ] `/api/health` and `/api/db-status` OK

### 7. Railway deploy (when deployed)

- [ ] Public URL loads login page
- [ ] `SMOKE_BASE_URL=https://… npm run smoke:phase0` passes critical checks

### 8. Audit log

- [ ] MP can open `/audit` placeholder (has `audit.view`)
- [ ] Auth events visible in Supabase `audit_logs` for pilot firm

## Ready for P0-12

When automated smoke passes and manual nav checks look correct, proceed to Phase 0 polish handoff.
