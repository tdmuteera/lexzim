# Recurring finance templates

QuickBooks-style recurring templates for LexZim.

## Kinds

| Kind | Creates |
|---|---|
| `expense` | Firm expense (operating cash by default) |
| `creditor_bill` | Open creditor invoice + AP GL |
| `fee_invoice` | **Draft** service invoice (review before send) |

## Modes

| Mode | Behaviour |
|---|---|
| `scheduled` | When due, create the document and advance `next_run_on` |
| `reminder` | When due, acknowledge / snooze without posting until staff clicks **Create now** |
| `unscheduled` | Manual **Run** only |

Intervals: weekly, monthly, yearly.

## UI / API

- UI: `/finance/recurring` (`finance.post`)
- `GET/POST /api/finance/recurring` (`action: run_due` supported)
- `GET/PATCH/DELETE/POST /api/finance/recurring/[id]` (`action: run`, optional `forceCreate`)
- Cron: `GET/POST /api/cron/finance-recurring` with `Authorization: Bearer CRON_SECRET`

Cron uses each template’s `created_by` user. Templates without an owner are skipped with an error entry.

## Migration

`0060_finance_recurring` — table `finance_recurring_templates` (RLS on, Data API still locked down).

## Related

- `/finance/expenses`, `/finance/creditors`, `/finance/invoicing`
- `docs/BANK_INBOX.md`
