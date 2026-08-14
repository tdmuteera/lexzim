# LexZim web phase roadmap status

Status of the hosted LexZim SaaS roadmap (Phases 0 to 6). Desktop / Tauri / SQLite paths are cancelled and out of scope.

**App version:** see `package.json` / Settings → About  
**Last roadmap closeout:** Phase 6 (P6-14)  
**Active phase:** None (Phase 6B payroll when partners request)

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

## Phase 6 deliverables

Source: T Pfigu Attorneys admin/bookkeeping proposal + `docs/FINANCE_HR_ADR.md`

- **Finance nav:** Invoicing (fees), Debtors, Trust, Reconciliations, Expenses & cashbook, Finance reports
- **Trust depth:** Client ledgers, vault/cash trust, three-way monthly reconciliation
- **Firm finance:** Expenses, business cashbook, aged debtors, simple P&L, month close
- **Finance KPIs:** Billed vs collected, ageing, cash bank/vault, expenses, profit, matters opened/closed
- **HR v1:** Staff records, contracts, leave (**no payroll**)
- **Migration:** Additive schema; `/billing` and `/trust` aliases retained

## Phase 6 progress

| Prompt | Task | Status |
|--------|------|--------|
| P6-01 | ADR + gap analysis | **DONE** |
| P6-02 | Schema | **DONE** (`0014`–`0016`) |
| P6-03 | Finance nav + RBAC | **DONE** |
| P6-04 | Fee invoicing desk | **DONE** |
| P6-05 | Debtors & aged AR | **DONE** |
| P6-06 | Trust client ledgers | **DONE** |
| P6-07 | Trust vault + bank-in | **DONE** |
| P6-08 | Three-way trust recon | **DONE** |
| P6-09 | Expenses + business cashbook | **DONE** |
| P6-10 | Weekly/monthly reports + P&L | **DONE** |
| P6-11 | Finance KPIs | **DONE** |
| P6-12 | HR staff + contracts | **DONE** |
| P6-13 | HR leave | **DONE** |
| P6-14 | Docs, smoke, Phase 6B handoff | **DONE** |

## Phase 6 non-goals (unchanged)

- Full Odoo-style double-entry GL / chart of accounts
- Bank feeds / payment gateways
- Marketing / social / newsletter product features
- **Payroll** → Phase 6B (`docs/PHASE6B_PAYROLL_HANDOFF.md`)

## What comes next

**Phase 6B** when partners request payroll (payslips, Zimbabwe statutory placeholders). Otherwise: pilot feedback, content, and ops on the Phase 6 finance desk and HR module.

## Related

- `docs/FINANCE_HR_ADR.md`
- `docs/PHASE6_SMOKE_TEST.md`
- `docs/PHASE6_READY_CHECKLIST.md`
- `docs/PHASE6B_PAYROLL_HANDOFF.md`
- `docs/user/Finance_Desk_Quickstart.md`
- `docs/user/HR_Quickstart.md`
- `PHASE 6 - Finance & HR Prompts.md`

## Final statements

**PHASE 6 COMPLETE — practice finance desk and HR v1 shipped; payroll deferred to Phase 6B**

**LEXZIM WEB PHASE ROADMAP 0–6 COMPLETE — iterate on pilot rollout, Phase 6B payroll when requested**
