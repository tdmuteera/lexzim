# LexZim quotations (Phase 7 P7-05)

Service catalogue and client quotations under **Finance → Quotations**. Quotes do **not** post to the general ledger until converted to an invoice (P7-06).

## Features

| Area | Detail |
|---|---|
| **Service catalogue** | `firm_services` seeded per firm (REV-ADV, REV-CONV, REV-ADMIN, REV-CONS) with default prices and revenue GL links |
| **Quotations** | `QT-0001` sequential per firm; status workflow draft → sent → accepted/declined/expired |
| **Lines** | From catalogue or ad hoc; qty × unit price; quote-level discount (amount or %) |
| **Export** | Branded PDF, Word, Excel via universal export engine |
| **Convert** | Sent or accepted quotes → draft invoice (lines + discount carried) |

## Schema

- `firm_services` — code, name, default price, revenue GL account, active flag
- `quotations` — client, optional matter, quote number, status, valid until, discount, notes
- `quotation_lines` — optional service link, description, qty, unit price, line total

Migration: `drizzle/migrations/0019_phase7_quotations.sql`

## API

| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/api/finance/services` | `billing.view` | List service catalogue (seeds on first access) |
| PATCH | `/api/finance/services` | `finance.quote.manage` | Update service name, price, active |
| GET | `/api/finance/quotations` | `billing.view` | List; filters: `status`, `clientId`, `from`, `to` |
| POST | `/api/finance/quotations` | `finance.quote.manage` | Create draft quote |
| GET | `/api/finance/quotations/[id]` | `billing.view` | Quote detail + lines |
| POST | `/api/finance/quotations/[id]/status` | `finance.quote.manage` | Mark sent, accept, decline |
| POST | `/api/finance/quotations/[id]/convert` | `finance.quote.manage` | Create draft invoice; optional `matterId` if quote has none |

## RBAC

- **View list/detail/export:** `billing.view`
- **Create, status, convert, edit catalogue:** `finance.quote.manage` (Managing Partner, Accounts by default)

## UI

- **Finance → Quotations** — filterable list
- **New quotation** — client search (CL number), optional matter, catalogue picker, line editor, discount, preview
- **Quote detail** — branded preview, export menu, status actions, convert to invoice

## Export

```
GET /api/export/quotation?format=pdf|docx|xlsx&id={quotationId}
```

Permission: `billing.view`. Audit action: `export.quotation`.

## GL policy

Quotation creation and status changes **do not** create journal entries. Revenue recognition happens when an invoice is sent/posted (P7-06).

Advance/retainer services (`REV-ADV`) follow trust liability rules on invoice posting, not at quote stage.

## Setup

After pulling P7-05:

```bash
npm run db:migrate
npm run db:seed:rbac
```

## Related

- `docs/EXPORTS.md` — export platform
- `docs/FULL_ACCOUNTING.md` — GL posting (P7-03+)
- `docs/PHASE7_ADR.md` — Phase 7 architecture
- `docs/CLIENTS.md` — CL numbers and KYC (P7-04)

**Next:** P7-06 — invoices, receipts, discounts with GL posting.
