# Dashboard (P3-13)

Home after login. Firm-scoped; matter widgets respect `matters.view_all`. Money and intake widgets are **permission-gated on the server** (null when the session lacks the permission).

## Core widgets (everyone with `dashboard.view`)

| Widget | Scope |
|---|---|
| Open / closed matters | view_all → firm; else assigned |
| New clients this month | Firm registry |
| Overdue procedures | view_all → firm; else assigned to you |
| Due in 7 days procedures | Same |
| Upcoming hearings (matter `next_hearing_at`) | Matter access |
| Recent activity | Matter access |
| Workload by lawyer | Managing Partner only |

## Role-aware widgets

| Widget | Permission | Notes |
|---|---|---|
| Hearings & deadlines / reminders | `calendar.view` | From reminders engine (procedures + matter deadlines + calendar hearings) |
| Overdue fee invoices | `billing.view` | Fee AR only. Label: Billing (fees) |
| Trust attention | `trust.view` | Trust balances / flags only. Label: Trust (client money) |
| Open intakes | `intake.view` | Prospects awaiting conversion |

Accounts users see billing/trust widgets but not calendar or intake. Junior/secretary see calendar/intake but not money.

## API

`GET /api/dashboard` — `dashboard.view`

Optional slices are omitted (`null`) without the matching permission. Never returns fee or trust aggregates to users without `billing.view` / `trust.view`.

## Labels

Keep **Billing** and **Trust** separate in UI and copy. Fee payments are never mixed into trust widgets.

## Next

**PHASE 3 COMPLETE.** See `docs/PHASE4_READY_CHECKLIST.md`.
