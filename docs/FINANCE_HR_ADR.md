# Finance & HR Architecture Decision Record (Phase 6)

**Status:** Accepted (Phase 6 started)  
**Date:** August 2026  
**Source brief:** T Pfigu Attorneys — Admin Workflow and Bookkeeping Proposal (Ruvimbo Chakona, Aug 2026)  
**Product:** LexZim web SaaS (Next.js + Supabase + Railway)  
**Related:** `PHASE 6 - Finance & HR Prompts.md`, `docs/REPORTS.md`, `docs/user/Billing_Trust_Quickstart.md`

---

## 1. Context

T Pfigu Attorneys requires a disciplined admin and bookkeeping operating model:

- Weekly and monthly financial oversight (debtors, outstanding invoices, trust and business reconciliations).
- Master trust bank account with per-client ledgers; optional trust cash/vault before banking.
- Three-way trust reconciliation (bank statement, firm trust ledger sum, client statements).
- Firm operating finance: invoicing, expenses, business bank cashbook, simple P&L.
- HR records: staff, contracts, leave (payroll deferred).

LexZim already implements Phase 3 **billing** and **trust** as separate modules with RBAC and reports. Phase 6 **extends and regroups** this into a **practice finance desk** and adds **HR v1**. It does **not** replace LexZim with a full Odoo-style general ledger.

---

## 2. Decision summary

| Topic | Decision |
|---|---|
| Finance shape | One **Finance** nav area with sub-sections; **trust and fees remain structurally separated** |
| Accounting depth | **Practice finance desk** (invoices, debtors, trust, recon, expenses, cashbook, P&L). **No** full double-entry GL / chart of accounts in Phase 6 |
| Trust vs fees | **Hard wall**: fee payments never post to trust; trust movements never mark invoices paid |
| Trust vault | Add **master trust cash/vault** distinct from master trust **bank** |
| Three-way recon | Formal monthly workflow with saved runs and sign-off |
| HR v1 | Staff records, contracts, leave. **Payroll → Phase 6B** |
| Marketing / social | **Out of scope** for LexZim product |
| Migration | **Additive** schema; keep all existing `invoices`, `fee_payments`, `trust_*` rows; regroup UI; `/billing` and `/trust` remain as aliases |
| Bank feeds / gateways | **Out of scope** |

---

## 3. Current LexZim capabilities (honest gap list)

### 3.1 Billing (fees) — **substantial foundation**

**What exists today**

| Area | Status |
|---|---|
| Schema | `invoices`, `invoice_lines`, `fee_payments`, `time_entries`, `disbursements` |
| Lifecycle | Invoice statuses: draft → sent → paid / overdue → void |
| UI | `/billing` list, invoice detail, create from unbilled, fee payments, print |
| Permissions | `billing.view`, `billing.manage` |
| Reports | `ar-aging` (fee AR by due-date buckets) |
| Separation | Schema comment and code path: fee payments **never** mixed with trust |

**Gaps vs proposal / target**

| Gap | Notes |
|---|---|
| Finance nav grouping | Billing is a top-level menu item, not under a unified Finance desk |
| Dedicated debtors desk | AR ageing exists as a report type; no first-class **Debtors** workspace with weekly export focus |
| Outstanding invoices report | Partially covered by billing list + AR report; not packaged as proposal-style weekly pack |
| Firm expenses | **Not built** |
| Business cashbook | **Not built** |
| Business bank reconciliation | **Not built** |
| Monthly P&L | **Not built** |
| Month-end close / period lock | **Not built** |
| Finance KPI dashboard | Dashboard has billing/trust widgets; no full KPI set from proposal Section 6 |
| Billed vs collected KPI | **Not built** as explicit metric |

### 3.2 Trust — **solid ledger, weak compliance workflow**

**What exists today**

| Area | Status |
|---|---|
| Schema | `trust_accounts`, `trust_ledger_entries` (receipt, disbursement, transfer, adjustment) |
| UI | `/trust`: ledger, accounts, client statement, post entry, negative balance guard + MP override |
| Client linkage | Entries tagged with `client_id` / `matter_id`; running balance on statement |
| Permissions | `trust.view`, `trust.manage` |
| Reports | `trust-balances`, `trust-movements` |
| Separation | Trust ledger **never** joined with `fee_payments` for balances |

**Gaps vs proposal / target**

| Gap | Notes |
|---|---|
| Master trust bank vs vault | Multiple `trust_accounts` exist but **no vault/cash trust** model or bank-in workflow |
| Per-client ledger as first-class view | Statement exists; no firm-wide “all client balances” desk tuned for audit |
| Three-way reconciliation | **Not built** (no saved recon run, bank statement balance entry, variance, sign-off) |
| Weekly trust recon report | Snapshot possible from reports; no formal weekly recon status |
| Vault count worksheet | **Not built** |
| Matter file ≠ accounting record | Supported in principle (separate modules); needs clearer UX copy under Finance |

### 3.3 Staff — **access control only, not HR**

**What exists today**

| Area | Status |
|---|---|
| Schema | `users`, `roles`, staff sessions |
| UI | `/staff`: invite user, assign role, deactivate, seat limits, revoke sessions |
| Permissions | `users.manage` (Managing Partner) |
| Roles | managing_partner, senior_associate, junior_associate, secretary, **accounts** |

**Gaps vs proposal / target**

| Gap | Notes |
|---|---|
| HR staff records | **Not built** (no job title, start date, emergency contact beyond user profile) |
| Contracts | **Not built** |
| Leave | **Not built** |
| Non-login staff | **Not built** (every staff row is a login user today) |
| Payroll | **Deferred Phase 6B** |

### 3.4 Clients, matters, KYC — **partial alignment**

**What exists today**

- One client, many matters (`clients`, `matters`).
- `matter_number`, `file_ref` on matters.
- Client fields: type, names, ID/reg, tax, contact, addresses, `kyc_notes`.

**Gaps**

| Gap | Notes |
|---|---|
| Formal client number (e.g. CL0001) | No dedicated `client_number` column; can add or derive |
| Structured KYC checklist | Notes only; no structured source-of-funds / verification status |
| Date of birth / relationship dates | **Not built** (proposal mentions for CRM; optional later) |

### 3.5 Reports & dashboard

**What exists:** `ar-aging`, `time`, `trust-balances`, `trust-movements`, `workload`, `upcoming`; dashboard fee/trust alert pills.

**Missing for proposal:** weekly finance pack UI, trust three-way recon status, business recon, expenses, P&L, finance KPI strip (billed vs collected, vault cash, profit, matters opened/closed).

---

## 4. Target Finance desk modules

Phase 6 regroups existing capability and adds missing firm finance + trust compliance depth.

```
Finance (nav)
├── Invoicing (fees)     ← extend current Billing
├── Debtors              ← AR ageing + outstanding invoices desk
├── Trust                ← extend current Trust (bank + vault)
├── Reconciliations      ← three-way trust + business bank lite
├── Expenses & cashbook  ← new (firm money only)
└── Finance reports      ← weekly/monthly pack + P&L + KPIs
```

**Trust wall (non-negotiable)**

```
┌─────────────────────┐     ┌─────────────────────┐
│  FIRM MONEY (fees)  │     │  CLIENT MONEY       │
│  invoices           │     │  trust_ledger       │
│  fee_payments       │     │  trust_accounts     │
│  expenses (new)     │     │  vault (new)        │
│  business cashbook  │     │                     │
└─────────────────────┘     └─────────────────────┘
         NO cross-posting between these worlds
```

UI must always label **Fee money (firm)** vs **Client money (trust)**. Accounts role and MP can post; lawyers typically read-only on finance (configurable).

---

## 5. Three-way trust reconciliation (definition)

Each month (and optionally weekly snapshot), the firm must confirm three views **agree**:

| View | Source in LexZim (target) |
|---|---|
| **A. Bank statement** | Managing Partner / Accounts enters **master trust bank** closing balance from Banc ABC (or firm bank) statement for the period. Manual entry; no bank feed in Phase 6. |
| **B. Firm trust ledger** | System sum of **all client trust ledger balances** held in the **bank** trust account(s), plus reconciliation to `trust_accounts` book balance. |
| **C. Client ledger** | Spot-check: export or drill into **client trust statements**; individual client balance must match their ledger lines. |

**Vault (separate control):** Master trust **cash/vault** balance = sum of client portions held in vault. Counted physically; reconciled before banking into master trust bank. Vault → bank transfer moves location, not ownership.

**Recon run record (target schema):** period, bank balance entered, ledger sum, variance, status (draft/completed), completed_by/at, notes. Default policy: **block complete if variance ≠ 0** unless MP override with audited reason.

---

## 6. HR v1 scope vs Phase 6B payroll

### Phase 6 (this phase)

| Module | Scope |
|---|---|
| Staff records | Directory: active/inactive, job title, start date, contact, emergency contact; link to login `users` when applicable; **allow non-login staff** |
| Contracts | Per staff: start/end, title, status, link to stored document optional |
| Leave | Types, requests, approve/reject, calendar list; simple annual entitlement counter (manual field) |

**Nav:** New **HR** section (distinct from **Staff / Users & access** which remains for login, roles, seats, sessions).

### Phase 6B (deferred)

- Payroll runs, payslips, PAYE, NSSA, statutory deductions
- Salary posting into expenses/cashbook
- Integration with monthly close

HR v1 data model should **anticipate** payroll (staff id, employment start, contract type) but not implement calculation engines.

---

## 7. Non-goals (Phase 6)

| Non-goal | Reason |
|---|---|
| Full Odoo-style GL | Overkill for v1; practice desk meets proposal without journal complexity |
| Chart of accounts / double-entry journals | Same |
| Bank feeds / Open Banking | Out of product scope; manual statement balances |
| Payment gateways | Phase 3 decision stands |
| Payroll | Phase 6B |
| Marketing, social calendar, newsletters | Not LPMS; proposal Section 8 excluded |
| Birthday CRM automation | Optional future; not Phase 6 |
| Depreciation engine | Light asset register only if time permits (P6-10) |
| Replacing Google Sheets in one cut | Parallel operation OK; CSV export + eventual import |

---

## 8. Migration and compatibility stance

1. **No destructive migration** of `invoices`, `fee_payments`, `trust_accounts`, `trust_ledger_entries`.
2. **Additive tables** for expenses, cashbook, recon runs, vault movements, HR.
3. **UI regroup:** Finance nav; `/billing` → Finance → Invoicing alias; `/trust` → Finance → Trust alias.
4. **Permissions:** Extend with `finance.*` and `hr.*` codes; map existing `billing.*` and `trust.*` to Finance sub-areas for backward compatibility during transition.
5. **Reports:** Existing report types remain; new finance pack adds proposal-aligned views.
6. **Audit:** All money and HR mutations continue through `audit_logs`.

---

## 9. Permission sketch (target)

| Role | Finance (fees) | Trust | Recon / month close | Expenses / cashbook | HR |
|---|---|---|---|---|---|
| **Managing Partner** | view + manage | view + manage | reconcile + close + override | view + manage | view + manage |
| **Accounts** | view + manage | view + manage | reconcile (draft/complete) | view + manage | view (optional manage if designated) |
| **Senior Associate** | view (typical) | view | — | — | — |
| **Junior Associate** | — | — | — | — | — |
| **Secretary** | — | — | — | — | — |

**Proposed permission codes (Phase 6)**

| Code | Purpose |
|---|---|
| `finance.view` | Enter Finance area, read dashboards and reports |
| `finance.post` | Post expenses, cashbook entries (firm money) |
| `finance.reconcile` | Complete trust and business reconciliations |
| `finance.close_month` | Lock accounting period |
| `billing.view` / `billing.manage` | Retained; map to Invoicing |
| `trust.view` / `trust.manage` | Retained; map to Trust |
| `hr.view` | See HR directory and own leave |
| `hr.manage` | Staff records, contracts, approve leave |

Default matrix updates in P6-03; MP retains all codes; **accounts** role gains `finance.*` and `hr.view`; lawyers unchanged unless firm configures otherwise.

---

## 10. Mapping proposal sections → LexZim Phase 6 prompts

| Proposal section | LexZim delivery |
|---|---|
| §2 Reporting calendar | P6-05, P6-08, P6-10, P6-11 |
| §3 Trust structure + three-way | P6-06, P6-07, P6-08 |
| §4 Master directory (Finance, HR folders) | Reflected in nav + docs; not a file-system product |
| §5 Client/matter numbering + KYC | Partial today; extend in P6-02/P6-04 if gaps block Accounts |
| §6 KPIs | P6-11 |
| §7 Google Sheets | Parallel; CSV export; optional import later |
| §8 Marketing | **Excluded** |
| HR (payroll, leave, contracts) | P6-12, P6-13; payroll → 6B |

---

## 11. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Users confuse trust and fees | Persistent UI labels; separate ledgers; no cross-post buttons |
| Full GL scope creep | ADR locks practice desk; revisit only if partners explicitly request |
| Parallel Google Sheets | Weekly report exports match sheet layout where practical |
| Vault cash mishandled | Vault is trust only; firm petty cash goes to expenses/cashbook |
| HR vs Users duplication | Clear nav: **Users & access** vs **HR records** |

---

## 12. Next steps

| Prompt | Deliverable |
|---|---|
| **P6-02** | Schema migrations: vault, recon, expenses, cashbook, HR tables |
| **P6-03** | Finance nav shell + RBAC |
| **P6-04 onward** | Feature delivery per Phase 6 prompt doc |

---

## 13. Approval

This ADR reflects partner agreement (Aug 2026):

- Practice finance desk, not full Odoo GL  
- Trust ≠ fees always  
- HR without payroll in Phase 6  
- Marketing out of scope  

**Phase 6 status:** STARTED (P6-01 complete)
