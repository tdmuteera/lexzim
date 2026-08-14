# Phase 6B payroll handoff

**Status:** Not implemented. Payroll was **deferred** from Phase 6 per partner decision.  
**Phase 6 delivered:** HR staff records, contracts, leave, and full practice finance desk without payslips or statutory engines.

Use this document when scoping **Phase 6B** (Zimbabwe payroll and payslips).

---

## 1. Partner intent (from admin/bookkeeping brief)

T Pfigu Attorneys workflow includes payroll alongside HR. LexZim Phase 6 built the **HR folder** without calculation engines so payroll can attach to real employment data later.

Phase 6B should deliver:

- Payslip generation per pay run
- Statutory deductions and employer contributions where applicable
- Payroll period close aligned with finance month-end (coordination, not full GL)
- Export for bank payment files (format TBD with firm accountant)

---

## 2. Zimbabwe payroll placeholders (to validate with accountant)

**Do not implement from this list without local professional sign-off.** Typical items for Zimbabwe firms:

| Area | Examples | Notes for LexZim |
|------|----------|------------------|
| PAYE | Income tax on employment income | Tables/rates change; need versioned tax year config |
| NSSA | National Social Security Authority | Employee + employer components |
| SDL | Skills development levy (employer) | Often % of gross |
| Other | Medical aid, pension, union, loan repayments | Firm-specific deduction types |

LexZim should **not** hard-code rates in application code without a **config layer** (per firm, per tax year) and audit on rate changes.

---

## 3. HR data already in LexZim (reuse in 6B)

| Source | Table / module | Payroll use |
|--------|----------------|-------------|
| Staff identity | `hr_staff_profiles` | Employee master |
| Login link | `hr_staff_profiles.user_id` | Optional portal for payslips |
| Employment dates | `start_date`, `end_date` | Eligibility, pro-rata |
| Job title / department | `job_title`, `department` | Payslip header, cost allocation (future) |
| Contracts | `hr_contracts` | Employment type, active contract |
| Leave taken | `hr_leave_requests` (approved) | Unpaid leave, annual balance checks |
| Annual entitlement | `annual_leave_entitlement_days` | Manual entitlement (no accrual in P6) |
| Firm currency | `firms` / settings | Payslip currency |

**Not in Phase 6 (needed for payroll):**

- Salary / wage rates (basic pay, hourly, commission)
- Pay frequency (monthly, bi-weekly)
- Tax IDs (TPIN, NSSA number per employee)
- Bank account for salary payment
- YTD totals per employee per tax year
- Pay run header + payslip lines tables

---

## 4. Finance desk boundaries (already built)

Phase 6 **firm finance** covers:

- Fee invoicing and debtors (not payroll)
- Firm expenses and business cashbook
- Simple P&L (fee **payments received** minus expenses)
- Month-end **period lock** on firm postings

Phase 6B payroll should:

- Post **net pay** and **statutory liabilities** in a way that does not break trust/fee separation
- Prefer **additive** payroll tables and optional cashbook links (salary payment out) rather than rewriting P&L from scratch
- **Not** require full double-entry GL unless partners explicitly reopen that scope

---

## 5. Non-goals already satisfied (do not redo in 6B)

| Item | Phase 6 status |
|------|----------------|
| Staff directory | Done (`/hr/staff`) |
| Contracts storage | Done (`/hr/contracts` + document upload) |
| Leave requests / approval | Done (`/hr/leave`) |
| Fee vs trust wall | Done (enforce in payroll: salaries are firm, not trust) |
| Full Odoo GL | Still out of scope unless new phase |
| Bank feeds | Out of scope |
| Marketing | Out of scope |

---

## 6. Suggested Phase 6B prompt outline (for planning)

1. Schema: `hr_pay_runs`, `hr_payslips`, `hr_payslip_lines`, `hr_salary_rates`, tax year config
2. UI: Payroll run wizard, payslip PDF, employee YTD view
3. RBAC: `hr.payroll.view`, `hr.payroll.manage` (or extend `hr.manage`)
4. Integrations: optional CSV for bank; no statutory filing API in v1
5. Docs: `HR_Payroll_Guide.md`, update smoke tests
6. Reuse leave balances and staff profiles from Phase 6

---

## 7. Open questions for partners

1. Pay frequency and pay run calendar (monthly only vs mixed)?
2. Who approves pay runs (MP only vs Accounts)?
3. Payslip delivery (print, email, future employee portal)?
4. Which statutory lines are mandatory for pilot firm vs optional?
5. Alignment with ZIMRA / NSSA filing exports (out of v1?)?

---

## Related

- `docs/FINANCE_HR_ADR.md`
- `docs/FINANCE_HR_SCHEMA.md`
- `docs/user/HR_Quickstart.md`
- `docs/ROADMAP_STATUS.md`
- `PHASE 6 - Finance & HR Prompts.md` (Section 7 deferred items)
