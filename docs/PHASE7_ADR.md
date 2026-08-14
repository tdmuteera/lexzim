# Phase 7 Architecture Decision Record — Practice Suite & Full Accounting

**Status:** Accepted (Phase 7 complete — P7-12)  
**Date:** August 2026  
**Source briefs:** T Pfigu Attorneys bookkeeper feedback; KYC intake form; revenue/expense chart; partner discussion  
**Product:** LexZim web SaaS (Next.js + Supabase + Railway)  
**Related:** `PHASE 7 - Practice Suite Prompts.md`, `docs/FINANCE_HR_ADR.md`, `docs/ROADMAP_STATUS.md`

---

## 1. Context

Phase 6 delivered a **practice finance desk**: fee invoicing, debtors, trust depth (vault + three-way recon), firm expenses, business cashbook, simple cash-basis P&L, and HR v1. That satisfied initial rollout but the firm bookkeeper now requires **full double-entry accounting** (chart of accounts, journal entries, trial balance, formal financial statements).

Partner feedback (Aug 2026) also requests:

- Quotations backed by a firm **price list / service catalogue**
- **Invoices and receipts** with discounts; client numbers (`CL0001`)
- Full **KYC/AML intake** aligned to the firm’s KYC PDF template
- **CRM** (birthdays, relationship view)
- **Calendar meetings** and dashboard widgets
- **Petty cash**, **creditors (AP)**, lawyer revenue analytics
- **Universal exports** (PDF, Word, Excel) on every report
- **Outbound email** for quotes, invoices, receipts, notifications
- **Tighter security**: MP/DevOps-only user creation; password reset by approval only

LexZim remains **multi-tenant SaaS**: every firm has its own data (`firm_id`). T Pfigu chart/KYC templates are **seed defaults**, never hard-coded tenant data.

**Supersedes:** Phase 6 non-goal “no full double-entry GL” (see `docs/FINANCE_HR_ADR.md` §2 — historical; Phase 7 extends accounting depth).

---

## 2. Decision summary

| Topic | Decision |
|---|---|
| Accounting | **Full legal GL** per firm: COA, balanced journal entries, trial balance, P&L (incl. gross profit), balance sheet |
| COA numbering | 4-digit bands: 1000 assets, 2000 liabilities, 3000 equity, 4000 revenue, 5000 direct costs, 6000–9000 operating expenses |
| COA seed | Default tree from bookkeeper chart; MP/Accounts edit per firm |
| Phase 6 P&L | Replaced by **GL-backed** statements; Phase 6 cash P&L remains until migration/backfill |
| Trust vs fees | **Hard wall unchanged**; GL mirrors trust as asset + client trust liability |
| Advance payments | **Trust/retainer** until earned; revenue recognition journal on apply to invoice |
| Direct client costs | **Client cost advances** (asset), not operating expense; link to matter disbursements |
| Client numbers | Auto `CL0001`, `CL0002`, … per firm |
| Matters | Existing matter numbers; searchable on finance/trust flows (**not** “meters”) |
| KYC | Sectioned AML/CDD form; compulsory: client type, first name, surname, phone, WhatsApp |
| Quotations | New entity; convert to invoice; discount supported |
| Exports | **PDF + Word + Excel** on every report (server-generated, firm-branded) |
| Email | Firm SMTP settings; send quote/invoice/receipt/notification (P7-11) |
| Password reset | Request queue; MP or DevOps master approves; no self-service email reset |
| Bank feeds / gateways | **Out of scope** |
| Payroll | **Phase 6B** (unchanged) |

---

## 3. Honest gap vs Phase 6 (current state)

### 3.1 What Phase 6 shipped (baseline)

| Area | Status |
|---|---|
| Finance nav | Invoicing, Debtors, Trust, Reconciliations, Expenses & cashbook, Finance reports |
| Fee billing | `invoices`, `invoice_lines`, `fee_payments`; lifecycle draft → sent → paid |
| Debtors | Aged AR desk + CSV |
| Trust | Client-tagged ledger, vault/bank, three-way recon runs |
| Firm books | `firm_expenses` (8 flat categories), `business_cashbook_entries`, month close lock |
| Reports | Operational CSV + finance weekly/monthly pack; browser print on some views |
| P&L | Simple cash-basis: fee payments received minus expenses (not GL) |
| HR | Staff profiles, contracts, leave |
| Clients | Registry with `full_name`, company fields, `kyc_notes` text only |
| Calendar | `calendar_events` incl. `appointment`, `hearing`, etc. |
| Dashboard | Lawyer workload (MP); finance KPIs; fee revenue chart (firm-wide) |
| Users | MP invites via `/staff`; no in-app password reset approval |
| AI | Conversational legal assistant (Phase 2+); not blocking Phase 7 |

### 3.2 Phase 7 gaps (to build)

| Gap | Priority prompt |
|---|---|
| General ledger (COA, journals, TB, BS) | P7-03 |
| GL posting from invoices, payments, trust, expenses | P7-03, P7-06, P7-07 |
| Universal PDF/DOCX/XLSX export engine | P7-02 |
| Service catalogue + quotations | P7-05 |
| Invoice/receipt documents + discount + GL | P7-06 |
| Client `CL0001` + structured KYC | P7-04 |
| Creditors (AP) + petty cash float | P7-07 |
| CRM birthdays (+ optional holidays) | P7-08 |
| Dashboard meetings + revenue by lawyer | P7-09, P7-10 |
| Email send (SMTP) | P7-11 |
| MP/DevOps password reset approval | P7-11 |

---

## 4. Phase 6 → GL mapping

Phase 7 adds **`gl_accounts`**, **`gl_journal_entries`**, **`gl_journal_lines`**. Operational tables remain source of truth for UX; posting rules create balanced journals.

| Operational event | Typical GL effect | Notes |
|---|---|---|
| Invoice sent/posted | Dr **1310 Accounts Receivable** · Cr **401x Revenue** (per line / service) | Discount reduces revenue or posts to contra account (policy in `FULL_ACCOUNTING.md`) |
| Fee payment received | Dr **1010 Operating Bank** · Cr **1310 AR** | Generates **receipt** document |
| Trust receipt | Dr **1210 Trust Bank** (or vault asset) · Cr **2100 Trust Liability** (client sub-ref on line) | Never credits fee revenue |
| Trust disbursement | Dr **2100 Trust Liability** · Cr **1210 Trust Bank** | Reference number required |
| Firm expense (cash) | Dr **6xxx Expense** · Cr **1010 Cash** | Category maps to COA leaf |
| Firm expense (on credit) | Dr **6xxx Expense** · Cr **2010 Accounts Payable** | Creditor bill |
| Creditor payment | Dr **2010 AP** · Cr **1010 Cash** | |
| Matter disbursement (client cost) | Dr **1320 Client Cost Advances** · Cr **1010/1210** (policy) | Not 6xxx operating expense |
| Disbursement billed to client | Dr **1310 AR** · Cr **4100 Reimbursed Client Costs**; relieve **1320** | Recovery pattern |
| Advance / retainer received | Dr **1210 Trust Bank** · Cr **2100 Trust Liability** | **Not** 4010 revenue until earned |
| Retainer applied to invoice | Dr **2100 Trust Liability** · Cr **401x Revenue** (and clearing entries as needed) | Revenue recognition |
| Petty cash: vault → float | Dr **1050 Petty Cash** · Cr **1020 Business Vault** (or 1010) | Firm money only |
| Petty cash spend (summary) | Dr **6xxx** · Cr **1050 Petty Cash** | No line-item mandate v1 |
| Manual adjustment | User-composed balanced entry | `finance.gl.post` |

**Invariant:** No journal entry may mix trust liability settlement with fee revenue in one ambiguous line without explicit source type and audit.

---

## 5. Trust wall and advance payments

Unchanged from Phase 6:

- Fee invoice payments use **`fee_payments`** → operating cash + AR.
- Client money uses **`trust_ledger_entries`** → trust bank/vault + trust liability.
- UI and GL both enforce separation.

**Advance payments** (bookkeeper “Advance Payments” revenue line) are **retainers**:

1. Record as trust receipt (client tagged).
2. GL: trust asset + trust liability only.
3. When applied to a fee invoice, post revenue recognition and reduce trust liability.

Quotations and invoices must label retainer lines distinctly from earned fees.

---

## 6. Direct costs vs operating expenses

Industry pattern (LeanLaw, QuickBooks legal guides): **hard client costs** (filing fees, expert witnesses, depositions) are **costs advanced for clients**, not firm overhead.

| Type | Examples | LexZim treatment |
|---|---|---|
| **Direct / client costs** | Expert witness, court filing, deposition | Matter **disbursement**; GL **1320 Client Cost Advances**; recover via invoice as **4100 Reimbursed costs** |
| **Operating expenses** | Rent, salaries, software, bar dues | **`firm_expenses`** → GL **6xxx–9xxx** |

**Gross profit** on P&L:

```
Total Revenue (401x, 4100, …)
− Total Direct Costs (501x cost of services or COGS presentation)
= Gross Profit
− Operating Expenses (6xxx+)
= Net Profit
```

Bookkeeper seed lists both layers (see Phase 7 prompts §4).

---

## 7. KYC scope

**Template reference (partner asset, not committed to repo):**  
`C:\Users\Administrator\Desktop\kyc\Law firm kyc form.pdf`

### 7.1 Sections (product-wide field model)

| Section | Content |
|---|---|
| 1 Classification | individual · corporate · partnership · trust |
| 2 Individual | Names (split), maiden, DOB, nationality, ID, address, email, phone, WhatsApp, occupation, employer, PEP |
| 3 Corporate | Registered/trading name, reg/tax, incorporation, addresses, industry, **UBO table** (≥25%) |
| 4 Matter & funds | Purpose of representation, source of funds |
| 5 Documents | Checklist + uploads (ID, proof of residence, incorporation docs, UBO IDs) |
| 6 Declaration | Consent, signatory, date |

### 7.2 Compulsory on create (partner rule)

- Client type  
- First name  
- Surname  
- Phone  
- WhatsApp  

All other fields optional until compliance review (may be required before trust receipt or matter open — future policy hook).

### 7.3 Multi-tenant

- Same field schema for all firms.  
- Each firm stores its own clients and uploaded KYC files (`firm_id`).  
- Firm logo/name on printed KYC export only.

---

## 8. Export rule

Every report and formal document (debtors, trial balance, P&L, balance sheet, quotations, invoices, receipts, trust statements, CRM birthday list, lawyer performance, etc.) must offer:

| Format | Use |
|---|---|
| **PDF** | Client-facing, archival, print |
| **Word (.docx)** | Edit letterhead, partner markup |
| **Excel (.xlsx)** | Bookkeeper analysis, pivot |

Implementation: shared export engine (P7-02), firm branding from firm profile, RBAC + audit on sensitive exports. CSV may remain as a fourth option where already present.

---

## 9. Competitor UX — what LexZim adopts

Research summary (Clio, MyCase, LeanLaw, QuickBooks legal). LexZim stays Zimbabwe-focused and multi-tenant; patterns below inform UX only.

| Pattern | Industry approach | LexZim Phase 7 |
|---|---|---|
| **KYC on contact** | Clio Compliance field set (ID, AML, source of funds, risk rating); optional by region | Sectioned client KYC tab; PEP + UBO; status draft/complete |
| **Intake forms** | MyCase dynamic sections; Clio Grow maps questions to contact fields | Wizard show/hide by `client_type`; no separate “Grow” product |
| **Quote → invoice** | Flat-fee templates; convert estimate | `quotations` → convert → `invoices` (P7-05/06) |
| **Trust accounting** | IOLTA bank + client trust liability; three-way recon | Phase 6 trust + GL 1210/2100 mirror (P7-07) |
| **Client cost advances** | QBO “Advanced Client Costs” asset account | 1320 + disbursement link (P7-07) |
| **COA** | 4-digit legal bands; trust separate from operating | Seeded per firm; editable (P7-03) |
| **Billing + books** | LeanLaw syncs to QBO; Clio adding accounting module | Native GL inside LexZim (no QBO required) |
| **Exports** | CSV + print common; PDF often add-on | PDF/DOCX/XLSX standard on all reports (P7-02) |
| **CRM** | DOB custom field; light birthday reminders | CRM nav: birthdays this/next month (P7-08) |

**UX tone:** Progressive disclosure — quick actions for daily work (quote, invoice, trust receipt); compliance depth on client profile tabs. Avoid grid-heavy “accounting ERP” feel on lawyer screens.

---

## 10. Migration and backfill

| Rule | Detail |
|---|---|
| Schema | **Additive only**; no drop of Phase 6 tables |
| Historical invoices/trust | Remain valid; optional **opening balance** journal script for go-live |
| Phase 6 P&L | Coexist until GL reports trusted; document cutover date per firm |
| COA seed | On firm first access to Accounting or on firm create hook |
| Client numbers | Backfill `CL0001…` for existing clients in migration (ordered by `created_at`) |
| KYC | Existing clients: `kyc_status=draft` until completed |
| `/billing`, `/trust` | Aliases preserved |

**Optional script (P7-03+):** `scripts/backfill-gl-opening.ts` — MP-only, dry-run default.

---

## 11. Permission sketch (Phase 7 additions)

New permissions to add in P7-03+ (seed in RBAC matrix):

| Code | Purpose | Typical roles |
|---|---|---|
| `finance.gl.view` | Chart of accounts, journals, TB, FS read | accounts, MP |
| `finance.gl.post` | Manual journals, post/void with audit | accounts, MP |
| `finance.quote.manage` | Service catalogue, quotations CRUD | accounts, MP, secretary (optional) |
| `clients.kyc.manage` | Edit KYC sections, upload compliance docs | MP, accounts, senior (policy) |
| `crm.view` | Birthday/holiday CRM module | lawyers+, accounts |
| `crm.manage` | Edit firm holidays | MP, accounts |
| `email.send` | Send quote/invoice/receipt/notification | accounts, MP, secretary (optional) |
| `users.approve_reset` | Approve password reset requests | MP, DevOps master |

Existing permissions retained: `finance.view`, `finance.post`, `finance.reconcile`, `finance.close_month`, `clients.*`, `trust.*`, `billing.*`, `users.manage`.

**DevOps master:** `devops@{firm-slug}.lexzim.local` seeded via `scripts/seed-firm-masters.ts`; same reset approval as MP.

---

## 12. Phase 7 prompt map

| Prompt | Deliverable |
|---|---|
| P7-01 | This ADR + roadmap update |
| P7-02 | Export engine (PDF/DOCX/XLSX) |
| P7-03 | GL core + COA seed |
| P7-04 | Clients CL + KYC |
| P7-05 | Service catalogue + quotations |
| P7-06 | Invoices/receipts + GL posting |
| P7-07 | Trust/petty cash/creditors + GL |
| P7-08 | CRM |
| P7-09 | Meetings dashboard |
| P7-10 | Lawyer revenue reports |
| P7-11 | Email + security |
| P7-12 | Docs, smoke, closeout |

---

## 13. Non-goals (Phase 7)

- Payroll / PAYE / NSSA (Phase 6B)
- Bank feeds / Open Banking
- Payment gateways (LawPay, Stripe)
- Automated marketing email campaigns
- Full tax/VAT filing engine
- Depreciation schedule engine (expense category “depreciation” OK as manual journal)

---

## 14. References

- `PHASE 7 - Practice Suite Prompts.md` (PROMPTS repo)
- `docs/FINANCE_HR_ADR.md` (Phase 6 baseline)
- `docs/FINANCE_HR_SCHEMA.md`
- `docs/REPORTS.md`
- `docs/CLIENTS.md`
- Clio: [Know Your Client](https://help.clio.com/hc/en-us/articles/40830064366875-Know-Your-Client)
- LeanLaw / QBO legal COA guides (client cost advances, trust liability)

---

**Handoff:** P7-02 complete (`docs/EXPORTS.md`). Ready for **P7-03** (chart of accounts + GL core).
