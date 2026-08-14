# Phase 6 readiness checklist

Phase 5 (Portal & Scale) is complete. Phase 6 adds the practice **finance desk** and **HR v1** without payroll.

## Phase 5 complete

- [x] Portal, privacy, ops tooling (`docs/PHASE5_SMOKE_TEST.md`)
- [x] `docs/ROADMAP_STATUS.md` Phase 5 closeout

## Phase 6 progress

- [x] P6-01 ADR + gap analysis (`docs/FINANCE_HR_ADR.md`)
- [x] P6-02 Schema (`0014_phase6_finance_hr.sql`, `0015`, `0016`, `docs/FINANCE_HR_SCHEMA.md`)
- [x] P6-03 Finance + HR nav + RBAC (`lib/module-nav.ts`, `docs/NAV_RBAC.md`)
- [x] P6-04 Fee invoicing desk (`/finance/invoicing`)
- [x] P6-05 Debtors (`/finance/debtors`)
- [x] P6-06 Trust client ledgers + statements
- [x] P6-07 Trust vault + bank-in
- [x] P6-08 Three-way trust recon (`/finance/reconciliations`)
- [x] P6-09 Expenses + business cashbook (`/finance/expenses`)
- [x] P6-10 Weekly/monthly reports + P&L (`/finance/reports`, period locks)
- [x] P6-11 Finance KPIs (reports tab + MP dashboard strip)
- [x] P6-12 HR staff + contracts (`/hr/staff`, `/hr/contracts`)
- [x] P6-13 HR leave (`/hr/leave`, `docs/user/HR_Quickstart.md`)
- [x] P6-14 Docs, smoke, Phase 6B handoff (`PHASE6_SMOKE_TEST.md`, `PHASE6B_PAYROLL_HANDOFF.md`)

## Definition of done (Phase 6 prompts header)

- [x] Finance nav: Invoicing, Debtors, Trust, Reconciliations, Expenses & cashbook, Finance reports
- [x] Existing fee invoices and trust postings preserved
- [x] Client trust ledger running balance + statement export
- [x] Trust vault + bank-in
- [x] Three-way trust reconciliation workflow
- [x] Business cashbook, expenses, aged debtors reports
- [x] Simple monthly P&L and finance KPI widgets
- [x] HR: staff profiles, contracts, leave (no payroll calc)
- [x] RBAC + audit on money and HR mutations
- [x] User docs updated; payroll marked Phase 6B
- [x] Smoke test script written
- [x] Phase 6B payroll handoff written

## Explicitly deferred

- [ ] Payroll, payslips, PAYE/NSSA engines → **Phase 6B** (`docs/PHASE6B_PAYROLL_HANDOFF.md`)
- [x] Full double-entry GL / chart of accounts → **delivered in Phase 7** (`docs/PHASE7_ADR.md`). Phase 6 explicitly deferred this; Phase 7 supersedes that non-goal.
- [ ] Bank feeds / payment gateways
- [ ] Marketing / social product features
- [ ] Depreciation beyond light asset register list

## Ops notes

- [ ] `npm run db:migrate` on staging/production for `0014`, `0015`, `0016`
- [ ] `npm run db:seed:rbac` after matrix changes (Accounts `hr.manage`, finance permissions)
- [ ] Run `docs/PHASE6_SMOKE_TEST.md` manual checklist before pilot finance rollout

## Related

- `docs/user/Finance_Desk_Quickstart.md`
- `docs/user/HR_Quickstart.md`
- `docs/user/Admin_Guide.md`
- `docs/ROADMAP_STATUS.md`

## Final statement

**PHASE 6 COMPLETE — finance desk and HR v1 ready; payroll deferred to Phase 6B**
