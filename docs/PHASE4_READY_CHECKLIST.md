# Phase 4 readiness checklist

Phase 3 (Practice Ops) must be complete before Sell & Ship work. Tick when true.

## Phase 3 complete

- [x] Practice-ops schema (calendar, deadlines, time, billing, trust, intake)
- [x] Calendar + deadlines + reminders
- [x] Time → fee invoice → fee payment (locked when invoiced)
- [x] Trust ledger separate from fees; no overdraw by default
- [x] Intake → conflict check → convert
- [x] Reports + CSV (`reports.view`)
- [x] Dashboard role-aware money/intake widgets + money endpoint hardening
- [x] Phase 3 demo seed + smoke (`npm run db:seed:phase3-demo`, `npm run smoke:phase3`)
- [x] Docs: `ARCHITECTURE_PHASE3.md`, `PHASE3_SMOKE_TEST.md`

## Platform prerequisites for Phase 4

- [ ] Railway production URL confirmed in `docs/HOSTING.md` / README
- [x] Supabase Postgres + Storage healthy for pilot firm
- [x] Trust ≠ Fees rules documented and enforced in APIs
- [x] Phase 2 AI grounding rules still intact

## Product boundaries for Phase 4

Phase 4 **may** add:

- Production AI packaging / cost controls for pilots
- Licensing and commercial onboarding
- Pilot firm rollout on Railway
- Sell & Ship operational polish

Phase 4 **must not**:

- Weaken `firm_id` isolation or money RBAC
- Mix trust ledger with fee payments
- Skip conflict gates on conversion
- Implement Phase 5 public portal unless a later Phase 5 prompt says so

## Suggested first Phase 4 session

1. Re-run `npm run smoke:phase3` (and prior smokes as needed)
2. Confirm Railway health URL
3. Open `PHASE 4 - Sell & Ship Prompts.md` from the prompts pack

## Phase 4 progress

- [x] P4-01 Production readiness audit (`docs/RELEASE_AUDIT_P4.md` + critical P1 fixes)
- [x] P4-02 Claude + OpenAI providers (`docs/AI.md`)
- [x] P4-03 Model routing, budgets & safety defaults
- [x] P4-04 Firm licence / activation (`docs/LICENSING.md`)
- [x] P4-05 Edition feature flags + seats (`docs/EDITIONS.md`)
- [x] P4-06 Licensed AI proxy MVP (`docs/AI_PROXY.md`)
- [x] P4-07 Versioning, changelog & About (`CHANGELOG.md`, `docs/RELEASING.md`)
- [x] P4-08 Railway production hardening (`docs/RAILWAY.md`)
- [x] P4-09 Domain, SSL, secrets checklist (`docs/PRODUCTION_SECRETS.md`)
- [x] P4-10 Pilot onboarding UX (`docs/ONBOARDING.md`)
- [x] P4-11 End-user docs pack (`docs/user/`, in-app Help)
- [x] P4-12 Pricing & sales docs (`docs/sales/`)
- [x] P4-13 Pilot runbook & support (`docs/ops/`, diagnostics download)
- [x] P4-14 Release smoke + Phase 5 handoff (`docs/PHASE4_SMOKE_TEST.md`, `ARCHITECTURE_PHASE4.md`, `PHASE5_READY_CHECKLIST.md`)

## Final Phase 4 statement

**PHASE 4 COMPLETE — ready for Phase 5 prompts (Client Portal, privacy tooling, scale beyond free tiers)**

## Final Phase 3 statement

**PHASE 3 COMPLETE — ready for Phase 4 prompts (Sell & Ship: production AI, licensing, onboarding, pilots on Railway)**
