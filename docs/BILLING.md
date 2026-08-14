# Billing & fees (P3-05 to P3-07)

Fee-side money: time, disbursements, invoices / fee notes, and fee payments. Trust money is separate.

## Disbursements ≠ trust

| | Disbursements (fee side) | Trust ledger |
|---|---|---|
| Purpose | Firm costs / recoverables on a matter | Client money held in trust |
| Table | `disbursements` | `trust_ledger_entries` |
| On invoice? | Yes (billable lines) | No. Never auto-post to trust |
| UI | Matter → **Costs** | `/billing` fee invoices (Trust is `/trust`) |

Do not mix `fee_payments` with trust balances. Recording a fee payment does **not** post to trust.

## Invoices / fee notes (P3-07)

### Create

**Billing → New from unbilled** pulls billable unbilled time (must have a rate) and disbursements for a matter, builds a **draft** fee note, and sets `invoice_id` on those source rows (locked).

Numbering: `firm_settings` keys `invoice_prefix` (default `INV`) and `next_invoice_number`.

### Statuses

`draft` → `sent` → `paid` / `overdue` / `void`

- Mark **sent**: sets issue date and due date (`invoice_due_days`, default 14)
- **Void**: unlocks source time/costs for re-invoicing
- Fee payment that covers the total auto-sets **paid**

### Fee payments

`POST /api/invoices/[id]/payments` records a fee receipt. No payment gateways. Not trust.

### UI

- `/billing` list with status / matter filters
- `/billing/invoices/[id]` detail, status actions, payments, **Print**

### Access

| Permission | Capability |
|---|---|
| `billing.view` | List and open fee notes |
| `billing.manage` | Create, status changes, fee payments |

### API

| Method | Path |
|---|---|
| GET/POST | `/api/invoices` |
| GET/PATCH | `/api/invoices/[id]` |
| POST | `/api/invoices/[id]/payments` |

## Disbursements (P3-06)

Matter **Costs** tab. See earlier sections in history; lock via `invoice_id`.

## Time (P3-05)

See `docs/TIME.md`.

## Money convention

Integer cents (`*_cents`) plus currency. Helpers: `lib/billing/money.ts`.

See also `docs/TRUST.md`.
