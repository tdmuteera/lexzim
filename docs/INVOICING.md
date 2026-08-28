# LexZim invoicing and receipts (Phase 7 P7-06 / Phase 10 P10-08)

Fee notes (invoices), fee receipts, invoice-level discounts, and GL posting.

## Payment → Receipt → Revenue

1. **Mark sent** (after approval when required) posts AR / fee revenue GL.
2. **Record payment** on the fee note (channel **Cash** or **Bank**, amount, date, optional reference). Same API for both channels; bank requires an explicit confirm tick.
3. LexZim allocates a **receipt number** (`RCP-…`), stores `fee_payments`, and posts **Dr cash / Cr AR**.
4. Download the **letterhead receipt** (PDF / Word / Excel) from the Receipts tab (PDF also opens after save).
5. Invoice **balance** drops; when payments + retainer cover the total, status becomes **paid**. Partial payments show as **partially paid** in the UI (status remains `sent`/`overdue` in the database).
6. **Debtors** and the **dashboard** recompute from fee payments on the next load. This is fee revenue, not trust.

Trust receipts are a separate ledger. Never use a fee receipt as a trust deposit.

## Features

| Area | Detail |
|---|---|
| **Invoice face** | Client number (CL0001), matter, service lines, discount |
| **Create flows** | Service catalogue invoice or draft from unbilled time/disbursements |
| **Numbering** | INV-0001 per firm (existing); RCP-0001 receipts per payment |
| **GL on sent** | Dr AR 1310, Cr revenue 401x per line; retainer lines Cr 2100 |
| **GL on payment** | Dr Cash 1010, Cr AR 1310 |
| **Discount** | Amount or % at invoice level; posts to 4050 Sales discounts |
| **Apply retainer** | Dr 2100 Trust liability, Cr AR on sent invoice |
| **Export** | Invoice and receipt PDF, Word, Excel |
| **Approval** | Optional pre-send gate (`approval_state`); GL still on Sent only |

## API

| Method | Path | Permission |
|---|---|---|
| GET/POST | `/api/invoices` | view / manage |
| GET/PATCH | `/api/invoices/[id]` | view / manage (PATCH posts GL on sent/void) |
| POST | `/api/invoices/[id]/approval` | manage (submit) / `invoice.approve` (approve/reject) |
| POST | `/api/invoices/[id]/payments` | manage (creates receipt + GL) |
| POST | `/api/invoices/[id]/apply-retainer` | manage |

**Service invoice POST body:** `clientId`, `matterId`, `lines[]`, optional `discountDollars` or `discountPct`, `notes`.

**Unbilled invoice POST body:** `matterId`, `includeTime`, `includeDisbursements` (unchanged).

## UI

- **Finance → Invoicing → New invoice** — catalogue form with client/matter search
- **From unbilled** — existing matter pull for time/disbursements
- **Invoice detail** — Record payment (Cash | Bank), Receipts tab, Apply retainer, exports
- **Send email** — manual only (no auto-send on payment)

## Schema

Migrations: `0020_phase7_invoices_gl.sql`, `0038_invoice_approval.sql`

- `invoices.discount_cents`, `discount_pct`, `retainer_applied_cents`, `approval_state`
- `invoice_lines.firm_service_id`, `revenue_gl_account_id`
- `fee_payments.receipt_number`

## Setup

```bash
npm run db:migrate
```

Existing firms receive COA account **4050 Sales Discounts** on first invoice GL post.

## Related

- `docs/FULL_ACCOUNTING.md` — posting rules
- `docs/QUOTATIONS.md` — convert quote to draft invoice
- `docs/EXPORTS.md` — export kinds `invoice`, `receipt`
- `docs/user/Billing_Trust_Quickstart.md` — fee vs trust
- `docs/PHASE10_ADR.md` — approval and AR rules
