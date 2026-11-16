# Debtors desk: money bar and reminders

QuickBooks-style collections polish on `/finance/debtors`.

## Money bar

The report includes a `moneyBar` strip (primary currency by outstanding balance):

- Unpaid (all)
- Current
- Overdue (every past-due bucket)
- 1–30 / 31–60 / 61–90 / 90+

Chips filter the table (`bucket` query: ageing code or `overdue`). Matter and client filters still apply.

## Payment reminders

`POST /api/finance/debtors/reminders`

| Body | Effect |
|---|---|
| `{ invoiceIds }` | Draft subject/body per client (no send) |
| `{ invoiceIds, send: true }` | Email PDF invoice(s) + message; log debtor communication; set next follow-up +7 days |
| `{ invoiceIds, logOnly: true }` | Log draft on the client timeline without email |

Manual send only (no silent cron). Requires client email on profile for send. Staff can edit the draft before send when reminding one client group.

UI: select invoices, **Remind selected**, **Remind overdue in view**, or per-row **Remind**.

## Related

- `DebtorCommunicationsPanel` (call log)
- `docs/EMAIL.md` (firm SMTP)
- `/api/email/send` (single document send modal)
