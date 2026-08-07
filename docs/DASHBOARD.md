# Dashboard (P1-10)

Home after login. Firm-scoped; matter widgets respect `matters.view_all`.

## Widgets

| Widget | Scope |
|---|---|
| Open / closed matters | view_all → firm; else assigned matters |
| New clients this month | Firm registry |
| Overdue procedures count | view_all → firm; else assigned to you |
| Overdue + due in 7 days lists | Same procedure scope |
| Upcoming hearings | Matter access scope |
| Recent activity | Matter access scope |
| Workload by lawyer | Managing Partner only |

No billing. No AI insights.

## API

`GET /api/dashboard` — requires `dashboard.view`

## UI

`/dashboard` → `DashboardView`

## Next

**P1-11:** Global search + UX polish.
