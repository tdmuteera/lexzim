# Reports (P3-12)

Firm-scoped operational reports. Permission: **`reports.view` only**.

## Reports

| Type | Description |
|---|---|
| `ar-aging` | Outstanding **fee** invoice balances by due-date buckets (current, 1-30, 31-60, 61-90, 90+) |
| `time` | Time aggregated by lawyer or matter (filters: date range, lawyer, matter) |
| `trust-balances` | Trust account balances and balances by client (**not** fee AR) |
| `trust-movements` | Trust ledger lines in a date range |
| `workload` | Open matters (prospective / open / on_hold) by responsible lawyer |
| `upcoming` | Calendar events and open matter deadlines in a window (default next 30 days) |

Fee AR and Trust are always labeled separately. Trust reports never include `fee_payments`.

## UI

`/reports` with report selector, filters, refresh, and **Download CSV**.

## API

`GET /api/reports/[type]?format=json|csv&from=&to=&lawyerId=&matterId=&clientId=&trustAccountId=&groupBy=lawyer|matter`

## CSV

UTF-8 CSV attachment `lexzim-{type}.csv`. Amounts are integer cents in CSV (display currency formatting is UI-only).

## Access

Roles with `reports.view`: Managing Partner, Senior Associate, Accounts (see `docs/RBAC.md`).

## Next

**P3-13:** Dashboard widgets + money endpoint RBAC hardening.
