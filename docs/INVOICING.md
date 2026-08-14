# LexZim invoicing and receipts (Phase 7 P7-06)

Fee notes (invoices), fee receipts, invoice-level discounts, and GL posting.

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

## API

| Method | Path | Permission |
|---|---|---|
| GET/POST | `/api/invoices` | view / manage |
| GET/PATCH | `/api/invoices/[id]` | view / manage (PATCH posts GL on sent/void) |
| POST | `/api/invoices/[id]/payments` | manage (creates receipt + GL) |
| POST | `/api/invoices/[id]/apply-retainer` | manage |

**Service invoice POST body:** `clientId`, `matterId`, `lines[]`, optional `discountDollars` or `discountPct`, `notes`.

**Unbilled invoice POST body:** `matterId`, `includeTime`, `includeDisbursements` (unchanged).

## UI

- **Finance → Invoicing → New invoice** — catalogue form with client/matter search
- **From unbilled** — existing matter pull for time/disbursements
- **Invoice detail** — client #, discount, Download exports, Receipts tab, Apply retainer
- **Send email** — disabled until P7-11

## Schema

Migration: `drizzle/migrations/0020_phase7_invoices_gl.sql`

- `invoices.discount_cents`, `discount_pct`, `retainer_applied_cents`
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

**Next:** P7-08 CRM birthdays and holidays.
