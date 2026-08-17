# LexZim web phase roadmap status

Status of the hosted LexZim SaaS roadmap (Phases 0 to 8). Desktop / Tauri / SQLite paths are cancelled and out of scope.

**App version:** see `package.json` / Settings → About  
**Last roadmap closeout:** Phase 8 (P8-14)  
**Next product track:** **Phase 6B payroll** (deferred) unless partners define otherwise.

## Phase summary

| Phase | Theme | Status |
|-------|-------|--------|
| 0 | Foundation (Next.js, Supabase, Railway, tenancy) | COMPLETE |
| 1 | Core LPMS (clients, matters, docs, RBAC, export) | COMPLETE |
| 2 | AI Legal Assistant (RAG, firm memory, grounding) | COMPLETE |
| 3 | Practice ops (calendar, billing, trust, reports) | COMPLETE |
| 4 | Sell & Ship (licences, seats, pilot pack, Railway harden) | COMPLETE |
| 5 | Portal & Scale (limited client portal, privacy, ops) | COMPLETE |
| 6 | Finance desk & HR (trust depth, firm books, HR v1; payroll deferred) | **COMPLETE** |
| 6B | Payroll (PAYE/NSSA, payslips) | **DEFERRED** |
| 7 | Practice Suite: full GL, KYC, quotes, CRM, exports, email, security | **COMPLETE** |
| 8 | Diagnostics, observability, controlled self-healing | **COMPLETE** |

## Phase 7 deliverables (shipped)

Source: bookkeeper + partner feedback Aug 2026; `docs/PHASE7_ADR.md`

- **Full accounting:** Chart of accounts, journal entries, trial balance, P&L (gross profit), balance sheet per firm
- **Quotations:** Service catalogue, quotes, convert to invoice, discounts
- **Clients:** `CL0001` numbers, structured KYC/AML intake from firm template
- **Documents:** Receipts; PDF + Word + Excel on every report
- **Trust depth:** Reference numbers, four-account clarity, GL mirror
- **Firm books:** Petty cash float, creditors (AP), bookkeeper expense tree
- **CRM:** Upcoming birthdays; optional public holidays
- **Dashboard:** Upcoming meetings, revenue by lawyer
- **Email:** Firm SMTP; send quote/invoice/receipt
- **Security:** MP user create; password reset approval queue

## Phase 7 progress

| Prompt | Task | Status |
|--------|------|--------|
| P7-01 | ADR + gap (full GL decision) | **DONE** |
| P7-02 | Universal export engine (PDF/Word/Excel) | **DONE** |
| P7-03 | Chart of accounts + GL core | **DONE** |
| P7-04 | Clients CL numbers + KYC | **DONE** |
| P7-05 | Service catalogue + quotations | **DONE** |
| P7-06 | Invoices, receipts, discounts (GL) | **DONE** |
| P7-07 | Trust, petty cash, creditors (GL) | **DONE** |
| P7-08 | CRM birthdays + holidays | **DONE** |
| P7-09 | Calendar meetings + dashboard | **DONE** |
| P7-10 | Lawyer caseload + revenue reports | **DONE** |
| P7-11 | Email + security | **DONE** |
| P7-12 | Docs, smoke, closeout | **DONE** |

## Phase 6 deliverables (shipped)

Source: T Pfigu Attorneys admin/bookkeeping proposal + `docs/FINANCE_HR_ADR.md`

- **Finance nav:** Invoicing (fees), Debtors, Trust, Reconciliations, Expenses & cashbook, Finance reports
- **Trust depth:** Client ledgers, vault/cash trust, three-way monthly reconciliation
- **Firm finance:** Expenses, business cashbook, aged debtors, simple P&L, month close
- **Finance KPIs:** Billed vs collected, ageing, cash bank/vault, expenses, profit, matters opened/closed
- **HR v1:** Staff records, contracts, leave (**no payroll**)
- **Migration:** Additive schema; `/billing` and `/trust` aliases retained

## Accounting scope change (Phase 6 → 7)

Phase 6 explicitly deferred **full double-entry GL**. Phase 7 **supersedes** that decision per bookkeeper requirement. Phase 6 practice desk tables remain; GL is additive and wired via posting rules (`docs/PHASE7_ADR.md` §4). Historical “no full GL” wording in `docs/FINANCE_HR_ADR.md` is annotated with this cross-reference.

**Payroll remains Phase 6B.** Phase 7 did not start PAYE/NSSA or payslips (`docs/PHASE6B_PAYROLL_HANDOFF.md`).

## Phase 6 / 7 non-goals (unchanged unless noted)

- Bank feeds / payment gateways
- Marketing / social / newsletter product features
- **Payroll** → Phase 6B (`docs/PHASE6B_PAYROLL_HANDOFF.md`)
- Full GL → **shipped in Phase 7** (no longer a non-goal)

## Phase 8 (in progress)

Source: `docs/PHASE8_ADR.md`. Extend health/ops/logging. Do not rebuild product modules.

| Prompt | Task | Status |
|--------|------|--------|
| P8-01 | ADR + gap vs current health/ops/logging | **DONE** |
| P8-02 | Schema: events, traces, diagnoses, repair actions | **DONE** |
| P8-03 | Correlation IDs + structured error envelope | **DONE** |
| P8-04 | Persist redacted events + request tracing | **DONE** |
| P8-05 | Expand health checks | **DONE** |
| P8-06 | Ops Diagnostics UI | **DONE** |
| P8-07 | Generated module registry + overlay | **DONE** |
| P8-08 | Workflow contracts + dependency graph | **DONE** |
| P8-09 | Frontend telemetry + error boundary | **DONE** |
| P8-10 | Layout anomaly detectors | **DONE** |
| P8-11 | AI diagnosis, evidence-bound | **DONE** |
| P8-12 | Runtime self-heal (allowlisted) | **DONE** |
| P8-13 | Patch proposals + verify/rollback | **DONE** |
| P8-14 | Docs, smoke, closeout | **DONE** |

**Payroll remains Phase 6B.** Phase 8 does not start PAYE/NSSA or payslips.

## What comes next

**Phase 6B payroll** stays deferred until partners reopen it. No new LexZim product phase is queued beyond that unless partners define otherwise.

## Related

- `docs/PHASE8_ADR.md` ← Phase 8 architecture
- `docs/PHASE8_RUNBOOK.md` ← DevOps diagnostics triage (P8-14)
- `docs/PHASE8_SCHEMA.md` ← diagnostic tables (P8-02)
- `docs/PHASE8_WORKFLOWS.md` ← seven v1 workflow contracts (P8-08)
- `docs/PHASE8_FRONTEND.md` ← browser telemetry + adoption notes (P8-09)
- `docs/PHASE8_SMOKE_TEST.md` ← diagnostics smoke + layout spot-checks
- `docs/PHASE8_DIAGNOSIS.md` ← rules + evidence-bound AI diagnosis (P8-11)
- `docs/PHASE8_RUNTIME_HEAL.md` ← allowlisted runtime self-heal (P8-12)
- `docs/PHASE8_PATCH_PROPOSALS.md` ← patch proposals + verify/rollback (P8-13)
- `docs/PHASE7_ADR.md` ← Phase 7 architecture
- `docs/PHASE7_SMOKE_TEST.md` ← closeout smoke
- `docs/EMAIL.md` ← Outbound email + user provisioning/security (P7-11)
- `docs/EXPORTS.md` ← PDF/Word/Excel export platform
- `docs/QUOTATIONS.md` ← Service catalogue and quotes (P7-05)
- `docs/INVOICING.md` ← Invoices, receipts, GL posting (P7-06)
- `docs/FULL_ACCOUNTING.md` ← GL
- `docs/FINANCE_HR_ADR.md` ← Phase 6 baseline (GL non-goal superseded)
- `docs/PHASE6_SMOKE_TEST.md`
- `docs/PHASE6B_PAYROLL_HANDOFF.md`
- `PHASE 7 - Practice Suite Prompts.md` (PROMPTS repo)
- `PHASE 8 - Diagnostics & Self-Healing Prompts.md` (PROMPTS repo)

## Final statements

**PHASE 6 COMPLETE — practice finance desk and HR v1 shipped; payroll deferred to Phase 6B**

**PHASE 7 COMPLETE — full accounting and practice suite shipped; payroll still deferred to Phase 6B**

**PHASE 8 COMPLETE — diagnostics, observability, controlled self-healing shipped; next remains Phase 6B payroll unless partners say otherwise**
