# Architecture: Phase 3 (Practice Ops)

Phase 3 adds calendar, deadlines, time/billing, trust, intake/conflicts, reports, and role-aware dashboard hardening on the Phase 0 to 2 platform.

## Scope delivered

- Calendar events (hearings / diary) firm-scoped
- Deadline templates + matter deadlines (+ reminders)
- Time entries and disbursements with invoice lock
- Fee invoices and fee payments (**not** trust)
- Trust accounts, ledger, statements, no-overdraw default
- Intake forms, conflict search, partner override, convert wizard
- Reports pack with CSV (`reports.view`)
- Dashboard widgets gated by billing / trust / intake / calendar permissions
- Invoice matter-access hardening; Trust vs Billing labels kept clear

## Explicitly not delivered (Phase 4+)

- Production licensing / billing of LexZim itself
- Self-serve onboarding / multi-firm sales flows
- Public client portal
- Payment gateways or bank feeds
- SMTP / cloud push notification providers
- Phase 5 cloud portal features

## Runtime

```text
Browser (TPfigu theme)
  → Next.js App Router on Railway
    → requirePermission / tenantFirmId
      → repos (calendar, billing, trust, intake, reports, dashboard)
        → Supabase Postgres (firm_id on every query)
```

## Domain (under firm)

```text
firm
├── calendar_events
├── deadline_templates → matter_deadlines
├── time_entries / disbursements → invoices → fee_payments
├── trust_accounts → trust_ledger_entries
├── intakes → conflict_checks → (convert) clients + matters
└── reports (computed views)
```

## Money & ethics

1. Trust ≠ Fees
2. Every trust movement audited
3. Conflict checks before conversion
4. Invoiced time/disbursements lock
5. `firm_id` on every query
6. Software assists compliance; the firm remains responsible

## Folder map

| Area | Paths |
|---|---|
| APIs | `app/api/calendar*`, `deadline*`, `invoices*`, `trust*`, `intakes*`, `reports*`, `reminders`, `dashboard` |
| UI | `components/calendar`, `billing`, `trust`, `intake`, `reports`, `dashboard` |
| Repos | `lib/repos/{calendar,billing,trust,intake,reports,dashboard,reminders}.ts` |
| Docs | `docs/{CALENDAR,DEADLINES,TIME,BILLING,TRUST,INTAKE,CONFLICTS,REPORTS,DASHBOARD,PRACTICE_OPS}.md` |
| Seeds / smoke | `scripts/seed-phase3-demo.ts`, `scripts/phase3-smoke.ts` |

## Verification

```powershell
$env:DEV_SEED_ENABLED = "1"
npm run db:seed:phase3-demo
npm run smoke:phase3
```

See `docs/PHASE3_SMOKE_TEST.md` and `docs/PHASE4_READY_CHECKLIST.md`.

## Next phase boundary

Open **`PHASE 4 - Sell & Ship Prompts.md`**. Do not implement Phase 4/5 features under Phase 3 prompts.
