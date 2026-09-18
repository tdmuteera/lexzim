# Phase 11 Architecture Decision Record — Finance depth and access

**Status:** Phase 11 **implementation complete** (P11-01 to P11-12). Awaiting partner browser verification before push.  
**Date:** September 2026  
**Source:** Finance person request (Payments split, Business vs Disbursement requisitions); partner prompt (client visibility, Payments tab, client accounts, revenue vs disbursement, staff email on tasks/approvals, lawyer commission); locked design discussion Sep 2026; `PHASE 11 - Finance Depth and Access Prompts.md`.  
**Product:** LexZim web SaaS (Next.js + Supabase + Railway)  
**Related:** `docs/ROADMAP_STATUS.md`, `docs/PHASE10_ADR.md`, `docs/FINANCE_HR_ADR.md`, `docs/TRUST.md`, `docs/INVOICING.md`, `docs/EMAIL.md`, `docs/RBAC.md`, `docs/PHASE11_CANDIDATES.md`

**Hosting process (locked with partner):** develop and verify locally; commit and push when the partner has checked the slice set. Do not invent a second host. SMTP may still fail on Railway Hobby; code notify correctly and never fake send success.

---

## 1. Context

Phases 0 to 10 shipped a working practice finance desk (invoicing, debtors, trust, expenses, GL), matter assignment visibility, workflow tasks/approvals (in-app), and lawyer performance (cash collected, no commission).

The finance person and partner now need:

1. **Client visibility by assignment** (associates see assigned clients; MP / granted roles see all; finance can see all for money work).
2. A **Payments** tab that records money in and **splits** it across trust hold, fee revenue categories, and disbursement float.
3. A **Client accounts** finance view for bookkeepers.
4. **Requisitions** (Business vs Disbursement) with approval and pay.
5. **Staff communication emails** and email on task assign / approval request (no auto client email).
6. **Configurable lawyer commission** on collected fees above a monthly target.

Phase 11 **extends** Finance, Clients, Workflow, email, and Lawyer Performance. It does **not** rebuild LexZim, merge trust into fee ledgers, or ship bank feeds / payment gateways / full statutory payroll.

---

## 2. Honest gap vs current code

### 2.1 Client list visibility

| Exists | Gap |
|---|---|
| `clients.responsible_lawyer_id` column + index | **List API is firm-wide** (`listClients` filters firm/archive/search only; no assignment scope) |
| Matters: `matters.view_all` vs responsible + `matter_team` | Clients have only `clients.view` (no `clients.view_all`) |
| Per-person permission ticks (Phase 9) | No finance override permission for client money views |

### 2.2 Payments tab / split intake

| Exists | Gap |
|---|---|
| Trust desk: receipt / disbursement / transfer / vault | No firm-wide **Payments** register |
| Invoice fee payments + receipt PDF; apply retainer (trust → AR) | No single intake UX that splits one cash event across trust hold + fee categories + disbursement float |
| Hard wall: fee payment ≠ trust receipt | Must keep wall; orchestration layer missing |

### 2.3 Trust vs fee payment paths

| Exists | Gap |
|---|---|
| `trust_ledger_entries` per client; firm trust bank/vault accounts | Not a dedicated “client bank account” product; balances are ledger sums (correct for v1) |
| `fee_payments` on invoices; GL on invoice send | No PaymentIntake entity linking one cash event to both trust and fee legs |
| Apply retainer API | Pattern to reuse for trust → fee allocation after intake |

### 2.4 Matter disbursements / expenses

| Exists | Gap |
|---|---|
| `disbursements` on matters (`paidFrom` operating\|trust) | No request/approve/pay requisition workflow |
| `firmExpenses` + business cashbook | Direct post, not Business requisition |

### 2.5 Requisitions

| Exists | Gap |
|---|---|
| Workflow approvals inbox (leave, advances, invoice approval, password reset) | **No requisition type** today |

### 2.6 Workflow email

| Exists | Gap |
|---|---|
| `createStaffNotification` on task/leave/invoice approval | **In-app only**; no SMTP on assign/approval |
| Firm SMTP + manual compose/send; `lib/email/mailer.ts` | No `staff_communication_emails` table (login email ≠ comms email) |
| Policy: no automatic client emails | Keep |

### 2.7 Lawyer performance vs commission

| Exists | Gap |
|---|---|
| `lib/repos/lawyer-performance.ts`: cash collected by matter responsible lawyer | **No** monthly target, commission %, or commission due panel |
| Reports + dashboard lawyer revenue | Settings for target/% missing |

### 2.8 Finance nav

| Exists | Gap |
|---|---|
| `FINANCE_TABS`: Invoicing, Debtors, Trust, Reconciliations, Expenses, Reports, Quotations, Petty cash, Creditors, Accounting | Missing **Payments**, **Client accounts**, **Requisitions**, **Commission** |

---

## 3. Locked decisions (Phase 11)

| Decision | Choice |
|---|---|
| Client list visibility | Assigned by default; MP all; `clients.view_all` grantable; `finance.view_all_client_accounts` for money work |
| Assigned definition | `clients.responsible_lawyer_id` OR any matter for that client where user is `responsibleLawyerId` OR `matter_team` member |
| Money in default | **Trust first** |
| Direct fee exception | Fees-only → firm fee bank / fee receipt path; never fake trust |
| Split lines | `trust_hold` \| `fee_revenue` (categories) \| `disbursement_float` (still trust). Must sum to cash received |
| Receipts | **One cash-received receipt** per bank/vault/fee-bank event; allocation is schedule/internal record, not a second cash intake |
| Fee categories | consultation, drafting, due_diligence, notarial, appearances, communications, correspondence, conveyancing, administration, other_fee |
| Disbursements | Client costs (filing, summons, Master, matter transport/airtime, statutory fees). Not firm profit |
| Business / operating | Firm overhead; never paid from client trust |
| Trust shortfall | Warn; allow firm pay as recoverable (setting `block_disbursement_if_trust_short` default OFF) |
| Requisition approval | Configurable thresholds; Business small → OM/Accounts; large → MP; Disbursement within trust → Finance/OM after approval; firm float / over threshold → MP |
| Email notify | Staff communication email registry; task assign + approval request; no auto client email; SMTP failure must not roll back the workflow write |
| Commission | Monthly target + % of **collected fee revenue** above target; exclude trust deposits and disbursements; not payroll |
| Non-goals | Payment gateways, bank feeds, full tax payroll rewrite, chatbot PDF/Excel export, calendar reminder emails, merging trust ledger into GL fee accounts |

---

## 4. Entity sketch

### 4.1 PaymentIntake

Cash event: firm, client, optional matter, receivedAt, amount, currency, destination (`trust_bank` \| `trust_vault` \| `fee_bank` \| `fee_vault`), method, reference, receiptNumber, createdBy, notes.

### 4.2 PaymentAllocationLine

Child of intake: `lineType` (`trust_hold` \| `fee_revenue` \| `disbursement_float`), optional `feeCategory`, amount, optional `invoiceId`, notes.

**Posting rule (orchestration, not one merged ledger):**

1. Trust destination: post trust receipt for client (full amount or trust portions; implement consistently in P11-05 and document in code).
2. `fee_revenue` lines: apply from trust to fees (reuse apply-retainer / fee payment patterns) **or** direct fee receipt when destination is `fee_bank`.
3. `disbursement_float` / `trust_hold`: remain trust liability (notes/tags for intent).

Never store fee revenue as if it were still trust liability after allocation.

### 4.3 FeeCategory

Enum / controlled vocabulary on allocation lines (see locked list). Not a separate COA rewrite; map to invoice/service labels and existing fee income GL where possible.

### 4.4 ClientFinanceSnapshot (view)

Computed read model: trust balance, fees billed/paid, unbilled disbursements, recent intakes/allocations, receipt links. No duplicate ledger tables.

### 4.5 Requisition

`type`: `business` \| `disbursement`.  
`status`: `draft` \| `pending_approval` \| `approved` \| `rejected` \| `paid` \| `cancelled`.  
Disbursement requires clientId + matterId.  
`paidFrom`: `trust` \| `firm_float` \| `operating`.  
`recoverable` when firm float used.

On Paid: business → firm expense/cashbook; disbursement → matter disbursement + trust debit if paid from trust.

### 4.6 StaffCommunicationEmail

firmId, userId, email, isPrimary. Login email may differ. Used only for staff notify.

### 4.7 CommissionSettings

firmId, monthlyTargetAmount, currency, commissionPercentAboveTarget, effectiveFrom, updatedBy. Audit on change.

### 4.8 CommissionPeriodSnapshot (optional)

Computed for month + lawyer from fee_payments attribution (same spirit as lawyer-performance). Prefer compute-on-read in v1; materialize later only if slow.

---

## 5. How Payments orchestrates without merging ledgers

```
Cash event (PaymentIntake)
        │
        ├─► trust_ledger_entries     (client money in / out)
        ├─► fee_payments / invoices  (firm revenue when allocated or fees-only)
        └─► finance_payment_allocation_lines  (audit of split intent)
```

- **Trust desk** remains source of truth for client money.
- **Invoicing** remains source of truth for fee notes and fee receipts.
- **Payments tab** is the bookkeeper intake and register that **calls** those repos inside one transaction.
- Reporting can join intakes → lines → trust/fee rows; it must not double-count cash (one intake = one cash event).

Apply retainer and existing fee payment receipt numbering stay; PaymentIntake may generate or link a receipt number for the cash event only.

---

## 6. Module map after Phase 11 (Finance)

Keep existing tabs. Add:

| Tab | Purpose |
|---|---|
| Payments | Money in register + split allocation |
| Client accounts | Per-client trust / fees / disbursements / intakes |
| Requisitions | Business + Disbursement request → approve → pay |
| Commission | Target/% settings + link to Lawyer Performance metrics |

Trust, Invoicing, Expenses remain. Deep links between them in P11-11.

Sidebar Practice / Finance / HR / Workflow unchanged in structure; only Finance sub-tabs grow.

---

## 7. Non-goals

- Bank feeds / payment gateways
- Full statutory payroll (Phase 6B still deferred beyond Phase 10 MVP)
- Silent scheduled client email campaigns
- Calendar / deadline reminder emails (deferred)
- Merging `trust_ledger_entries` and `fee_payments` into one physical table
- Promising “full double-entry ERP”; this is practice finance with clear split allocations
- Replacing Phase 8 diagnostics
- Hard-delete of live financial history for ordinary firm users

---

## 8. RBAC keys to add (P11-02 / P11-03)

| Code | Intent |
|---|---|
| `clients.view_all` | List/open all firm clients |
| `finance.view_all_client_accounts` | Finance client accounts firm-wide |
| `finance.payments.view` / `finance.payments.create` | Payments tab |
| `finance.requisitions.view` / `request` / `approve` / `pay` | Requisitions |
| `finance.commission.configure` | Edit target and % |
| `finance.commission.view` | See commission panel (may fold under reports.view) |

Managing Partner role gets view_all and configure by default. Associates keep assigned-only clients unless granted.

---

## 9. Implementation sequence

Follow prompts P11-02 → P11-12. Do not implement schema in P11-01.

Known ops limit: Railway Hobby may block outbound SMTP; notify helper must log failure and keep in-app notification.

---

## 10. Definition of done (phase)

See Phase 11 prompts section 5. Partner browser checklist in prompts section 8.

---

## 11. Relationship to PHASE11_CANDIDATES.md

Earlier candidates (statutory payroll, inbound email, portal parity, AML, newsletter batch) remain **not** this phase’s commitment. Phase 11 is the locked finance-depth package above. Update candidates doc later if partners re-prioritize.

---

## 12. Schema addendum (P11-02)

**Shipped:** migration `0045_phase11_finance_depth.sql` and Drizzle tables:

- `finance_payment_intakes`
- `finance_payment_allocation_lines`
- `finance_requisitions`
- `staff_communication_emails`
- `finance_commission_settings`

Permission codes added to `permissions` + role matrix defaults (MP, Accounts, associates/secretary as documented in `docs/PHASE11_SCHEMA.md`).

**Still separate:** `trust_ledger_entries` and `fee_payments` are not merged. Intakes will call those repos in P11-05.

**Firm setting (P11-08):** `block_disbursement_if_trust_short` via `firm_settings` (default OFF).

---

## 13. Client visibility (P11-03)

**Assigned** means any of:

1. `clients.responsible_lawyer_id` = user  
2. User is `matters.responsible_lawyer_id` on a matter for that client  
3. User is on `matter_team` for a matter of that client  

**See all clients** when Managing Partner or `clients.view_all`.

**Client finance accounts override** when Managing Partner or `finance.view_all_client_accounts` (stub API `/api/finance/client-accounts`).

Staff Access Checklist exposes ticks: View all clients; All client finance accounts. Access updates audit `visibilityGrantsBefore` / `visibilityGrantsAfter`.

Smoke: `npx tsx scripts/check-client-visibility.ts`.

---

## 14. Finance nav shells (P11-04)

Shipped empty tabs (purpose copy only; no posting yet):

| Route | Permission | Full UI in |
|---|---|---|
| `/finance/payments` | `finance.payments.view` | P11-05 |
| `/finance/client-accounts` | `finance.view` | P11-06 |
| `/finance/requisitions` | `finance.requisitions.view` | P11-07 |
| `/finance/commission` | `finance.commission.view` | P11-10 |

`FINANCE_TABS`, `ROUTE_PERMISSION_RULES`, and `routeMeta` updated. Existing Trust / Invoicing / Expenses tabs unchanged. Finance layout still uses `FinanceModuleNav` + `ModuleTabMotion`.

---

## 15. Payments intake (P11-05)

**UI:** `/finance/payments` (`PaymentsView`)  
**API:** `GET/POST /api/finance/payments`, `GET /api/finance/payments/[id]`  
**Receipt:** `GET /api/export/payment_intake?id=…&format=pdf` (one cash-event number `PAY-####`; allocation is a schedule)

### Posting rule (trust destination)

1. Insert intake + allocation lines; allocate `PAY-####`.
2. Post **one trust receipt for the full cash amount** (ledger + standard trust GL 1210/2100).
3. For each `fee_revenue` line: trust ledger **disbursement with `skipGl`** (so client trust balance falls), then:
   - with invoice → `postApplyRetainerGl` (Dr 2100 / Cr 1310), or
   - without invoice → `postFeeEarnedFromTrustGl` (Dr 2100 / Cr fee revenue by category).
4. `trust_hold` and `disbursement_float` remain trust liability.

### Fees-only (`fee_bank` / `fee_vault`)

No trust posts. `fee_revenue` only.
- **fee_bank**: banked firm fees → Dr **1010** Operating Bank (invoice path via `createFeePayment`, or direct fee revenue).
- **fee_vault**: firm fee cash still on hand → Dr **1020** Business Vault (same invoice / direct paths with vault cash GL).

With invoice → `createFeePayment` reusing the intake `PAY-####` (no second cash number). Without invoice → direct cash / Cr fee revenue.

Trust and fee ledgers stay separate. Audit: `finance_payment_intakes.create`.

---

## 16. Client accounts (P11-06)

**UI:** `/finance/client-accounts` (`ClientAccountsView`)  
**API:** `GET /api/finance/client-accounts`, `GET /api/finance/client-accounts/[id]`

Read model only (no duplicate ledgers): trust balance + recent movements, fee invoices/receipts, unbilled billable disbursements, Payments intakes with receipt links.

**Visibility:** tab/route gated by `finance.view`. Index/detail use `canViewAllClientAccounts` (MP or `finance.view_all_client_accounts`) for all clients; otherwise assigned clients only.

Clear labels separate Trust money, Firm fee revenue, and Disbursements (client costs).

---

## 17. Requisitions (P11-07)

**UI:** `/finance/requisitions` (`RequisitionsView`)  
**API:** `GET/POST /api/finance/requisitions`, `GET /api/finance/requisitions/[id]`, `POST .../[id]/action`

**Types:** Business (nature + description, no client) · Disbursement (Client → Matter required).

**Flow:** create (pending approval by default) → approve/reject → pay / cancel. In-app notify on submit and outcomes. Approvals inbox includes `kind: "requisition"`.

**Starter thresholds** (`lib/finance/requisition-constants.ts`): business/disbursement ≥ $500 or firm-float/shortfall → Managing Partner must approve (or pay firm float).

**On paid:**
- Business → `createFirmExpense` (operating)
- Disbursement from trust → matter disbursement + trust ledger debit
- Disbursement firm_float → matter disbursement + `recoverable=true` (P11-08 hardens block setting)

Audit: `finance_requisitions.create` / `.submit` / `.approve` / `.reject` / `.pay` / `.cancel`.

---

## 18. Trust shortfall / recoverable (P11-08)

**Setting:** `block_disbursement_if_trust_short` in `firm_settings` (default OFF). Exposed on Settings → Firm profile.

**Pay preview** shows trust balance vs requested amount and policy message.

| Case | Behaviour |
|---|---|
| Enough trust | Prefer pay from trust |
| Short + allow (default) | Warn; firm float allowed; `recoverable=true` |
| Short + block ON | Firm float pay rejected until top-up |

**Recoverable list:** Requisitions filter `recoverable=1`; Client accounts detail section. Settle via action `settle_recoverable` (clears recoverable flag + audit).

Smoke: `npx tsx scripts/check-trust-shortfall-policy.ts`.

---

## 19. Staff communication email + notify (P11-09)

**Table:** `staff_communication_emails` (up to three addresses per user; first is primary; login email is fallback when none are set). `resolveStaffNotifyEmails` expands each user to all of their addresses so business and personal inboxes get the same staff SMTP notice.

**Settings:** Account profile → Communication email. MP/admin: `PUT /api/users/[id]/communication-email`.

**Helper:** `notifyStaffEvent` (`lib/notifications/notify-staff-event.ts`)
- Always creates in-app `staffNotifications`
- Best-effort `sendFirmEmail` using firm SMTP From (T Pfigu when configured)
- SMTP failure: log + audit `staff_notify.email_failed`; **does not roll back** the task/approval write
- Last failure shown on Settings → Email (`staffNotify.lastError`)

**Hooks:** task assign (create + reassign); invoice / requisition / leave / advance approval-pending notifies.

---

## 20. Commission (P11-10)

**Table:** `finance_commission_settings` (monthly target cents, currency, % above target, effectiveFrom). Saves insert a new row; audit `finance_commission_settings.save`.

**UI:** Finance → Commission (`finance.commission.view` / `configure`).
- Configure monthly target (default suggestion 3000) and % (e.g. 25).
- Month picker: per lawyer collected, target, remaining, above, commission due.
- Formula help text on the panel.

**Basis:** Same as Lawyer Performance: `fee_payments` in the calendar month → invoice matter → current `responsible_lawyer_id`. Trust and disbursements excluded. Not payroll.

**Lawyer Performance:** Link to Commission; when From/To are the same calendar month and user has `finance.commission.view`, overlay remaining / above / commission due columns.

**Example:** target 3000, 25%, collected 4000 → above 1000 → commission due 250.

Smoke: `npx tsx scripts/check-commission-formula.ts`.

---

## 21. Consistency pass (P11-11)

**Cross-links:** Trust, Invoicing (list + invoice detail), Payments, Client accounts, Expenses, and Requisitions panel heads / desk callouts link to Payments, Client accounts, Trust, Invoicing, Expenses, and Requisitions as appropriate.

**Cash / posting (unchanged, re-checked):**
- `createPaymentIntake`: one cash event; trust destination posts full receipt then fee lines as trust disbursement + fee GL/retainer; fee_bank never touches trust. No double fee_payments for trust-applied fees.
- `payRequisition`: business → `createFirmExpense` (Expenses list); disbursement → `createDisbursement` on the matter (+ trust debit if paid from trust).

**Empty states:** Expenses and matter Costs mention requisition-sourced rows.

**Nav docs:** `docs/NAV_RBAC.md` no longer labels Payments/Commission as shells.

**Partner checklist:** `docs/PHASE11_MANUAL_TEST.md`.

---

## 22. Closeout (P11-12)

**User docs:** `docs/user/Finance_Phase11_Guide.md` (+ Help `/help/finance-depth`); updates to Finance desk, Billing/Trust, Clients KYC, FAQ, Admin, README.

**Smoke:** `check-client-visibility.ts`, `check-trust-shortfall-policy.ts`, `check-commission-formula.ts`. Partner checklist remains `PHASE11_MANUAL_TEST.md`.

**Known limits:**
- SMTP outbound may fail on Railway Hobby/Trial (staff notify logs failure; workflows still save)
- Commission is not payroll; no salary posting
- No bank feeds or payment gateways
- Full PAYE/NSSA remains Phase 6B

**Push policy:** do not push `master` until partner verifies the manual checklist (or explicitly accepts known limits).
