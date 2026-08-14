# Development seed users (P0-11)

**Never run in production.** Seeds are blocked unless `DEV_SEED_ENABLED=1` and `NODE_ENV` is not `production`.

## Run

```powershell
cd C:\Users\Administrator\Desktop\Projects\EXPERIMENTS\lexzim

# Roles/permissions (safe anytime)
npm run db:seed:rbac

# Demo staff users + isolation test firm
$env:DEV_SEED_ENABLED = "1"
npm run db:seed:dev-users
```

Requires `.env.local` with `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

## Pilot firm staff (T Pfigu Attorneys or first non-demo firm)

Shared dev password for seeded staff: **`<set-in-env>`**

| Role | Email | Password |
|---|---|---|
| Senior Associate | `senior@lexzim.local` | `<set-in-env>` |
| Junior Associate | `junior@lexzim.local` | `<set-in-env>` |
| Secretary | `secretary@lexzim.local` | `<set-in-env>` |
| Accounts | `accounts@lexzim.local` | `<set-in-env>` |

**Managing Partner** is not auto-seeded if one already exists. Your live MP:

| Role | Email | Password |
|---|---|---|
| Managing Partner | `mp@lexzim.local` | `<set-in-env>` (from bootstrap) |

## Isolation test firm (second tenant)

| Role | Email | Password |
|---|---|---|
| Managing Partner | `isolation@lexzim.local` | `<set-in-env>` |

Firm: **Isolation Test Firm** (`isolation-test-firm`, `is_demo=true`).

Used to verify tenant isolation: MP from T Pfigu should not see this firm's data in scoped APIs.

## Optional demo tenant (no users)

```powershell
$env:DEMO_SEED_ENABLED = "1"
npm run db:seed:demo-firm
```

Creates **Demo Law Firm** only (no users).

## Phase 1 Zimbabwe demo data

```powershell
$env:DEV_SEED_ENABLED = "1"
npm run db:seed:phase1-demo
```

Seeds into the pilot firm (idempotent via `firm_settings.phase1_demo_seeded_at`):

- Clients: Tendai Moyo, Chitungwiza Trading (Pvt) Ltd, Farai Ncube
- Matters: Family (Harare High Court), Civil debt recovery, Labour unfair dismissal
- Overdue + upcoming procedures, timeline notes, related parties
- Text document fixture + Family/Civil/Labour starter templates (if missing)
- Junior assigned to civil (responsible) and family (assisting) when junior user exists

## Phase 3 practice-ops demo data

```powershell
$env:DEV_SEED_ENABLED = "1"
npm run db:seed:phase1-demo
npm run db:seed:phase3-demo
```

Seeds into the pilot firm (idempotent via `firm_settings.phase3_demo_seeded_at`):

- Calendar hearing on an existing matter
- Deadline template + open matter deadline
- Billable time + disbursement → fee invoice `P3-DEMO-001` + partial fee payment
- Trust account + client trust receipt (separate from fees)
- Optional related-party fixture for demos

Smoke: `npm run smoke:phase3` (see `docs/PHASE3_SMOKE_TEST.md`).

## Audit

Seed actions write `dev.seed_user`, `dev.seed_isolation_firm`, and `dev.seed_isolation_marker` to `audit_logs`.

## Verify nav per role

After seeding, log in at http://localhost:3000/login and compare sidebar to `docs/NAV_RBAC.md`.
