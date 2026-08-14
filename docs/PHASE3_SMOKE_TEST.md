# Phase 3 smoke test

Use after Phase 3 practice-ops work (P3-01 to P3-14). App must be running.

```powershell
npm run dev

# Optional seeds (once):
$env:DEV_SEED_ENABLED = "1"
npm run db:seed:phase1-demo
npm run db:seed:phase3-demo

# Optional Railway:
# $env:SMOKE_BASE_URL = "https://YOUR-APP.up.railway.app"

npm run smoke:phase3
```

Re-seed RBAC after permission matrix changes:

```powershell
npm run db:seed:rbac
```

## Credentials (dev)

| User | Email | Password |
|---|---|---|
| Managing Partner | `mp@lexzim.local` | `<set-in-env>` |
| Accounts | `accounts@lexzim.local` | `<set-in-env>` |
| Secretary | `secretary@lexzim.local` | `<set-in-env>` |
| Isolation MP | `isolation@lexzim.local` | `<set-in-env>` |

## Checklist (P3-01 to P3-14)

| # | Check | How | Pass? |
|---|---|---|---|
| 1 | Calendar | `/calendar` list / create hearing linked to matter | |
| 2 | Deadlines | Settings templates + matter Deadlines tab apply template | |
| 3 | Time → invoice → payment | Matter Time + Costs → Billing create fee note → fee payment (not trust) | |
| 4 | Trust receipt / statement | `/trust` receipt + client statement | |
| 5 | Trust no overdraw | Disbursement that would go negative blocked unless audited override | |
| 6 | Reports CSV | `/reports` Download CSV (AR + trust) | |
| 7 | RBAC | Secretary blocked from billing | |
| 8 | Dashboard | Role-aware widgets (billing/trust vs calendar) | |
| 9 | firm_id isolation | Isolation user does not see pilot invoices | |
| 10 | Railway / health | `GET /api/health`; production URL when set in `docs/HOSTING.md` | |

## Automated coverage

`npm run smoke:phase3` covers calendar, deadline templates, time/invoices, trust accounts/ledger, overdraw block, reports CSV, dashboard permissions, secretary/accounts RBAC, isolation invoices, reminders, health.

Manual: print invoice, Railway URL confirmation, visual Billing vs Trust labels.

## Docs

- `docs/PRACTICE_OPS.md`
- `docs/CALENDAR.md`, `docs/DEADLINES.md`, `docs/REMINDERS.md`
- `docs/TIME.md`, `docs/BILLING.md`, `docs/TRUST.md`
- `docs/INTAKE.md`, `docs/CONFLICTS.md`, `docs/INTAKE_CONVERT.md`
- `docs/REPORTS.md`, `docs/DASHBOARD.md`, `docs/RBAC.md`
- `docs/ARCHITECTURE_PHASE3.md`
- `docs/PHASE4_READY_CHECKLIST.md`

## Final statement

**PHASE 3 COMPLETE — ready for Phase 4 prompts (Sell & Ship: production AI, licensing, onboarding, pilots on Railway)**
