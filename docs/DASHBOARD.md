# Dashboard (P3-13, P7-09)

Home after login. Firm-scoped; matter widgets respect `matters.view_all`. Money widgets are **permission-gated on the server** (null when the session lacks the permission).

## Core widgets (everyone with `dashboard.view`)

| Widget | Scope |
|---|---|
| Open / closed matters | view_all → firm; else assigned |
| New clients this month | Firm registry |
| Overdue procedures | view_all → firm; else assigned to you |
| Due in 7 days procedures | Same |
| Recent activity | Matter access |
| Workload by lawyer | Managing Partner only |

## Calendar widgets (`calendar.view`)

| Widget | Source | Limit |
|---|---|---|
| Upcoming meetings | `calendar_events` where `event_type = appointment`, future starts | 5 (10 for Managing Partner) |
| Upcoming hearings | Matter `next_hearing_at` | 5 (10 for MP) |
| Upcoming diary | Mixed reminders (meetings, hearings, overdue, due soon) | 6 items |
| Caseload by lawyer | Open matters by `responsible_lawyer_id` | Scoped: MP / finance.view / matters.view_all see all; others see self |
| Revenue by lawyer | Fee receipts in last 6 months, same attribution | Hidden without billing/reports/finance |

Meeting rows show client name, optional matter, location, and link to matter or client profile.

## Role-aware widgets

| Widget | Permission | Notes |
|---|---|---|
| Hearings & deadlines / reminders | `calendar.view` | From reminders engine (procedures + matter deadlines + calendar hearings + meetings) |
| Overdue fee invoices | `billing.view` | Fee AR only. Label: Billing (fees) |
| Trust attention | `trust.view` | Trust balances / flags only. Label: Trust (client money) |

Accounts users see billing/trust widgets but not calendar. Junior/secretary see calendar but not money.

## API

`GET /api/dashboard` — `dashboard.view`

Response includes `upcomingMeetings` and `upcomingHearings` when the session has `calendar.view`. Optional slices are omitted (`null`) without the matching permission. Never returns fee or trust aggregates to users without `billing.view` / `trust.view`.

Dashboard load also triggers meeting reminder sync (`syncMeetingRemindersForFirm`).

## Labels

Keep **Billing** and **Trust** separate in UI and copy. Fee payments are never mixed into trust widgets.

## Next

Phase 7 complete. Payroll remains Phase 6B. See `docs/ROADMAP_STATUS.md`.
