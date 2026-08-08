# Reminders (P3-04)

In-app reminder centre for **overdue**, **due soon** (7 days), and **hearings**. Firm and RBAC scoped. No SMTP email. No cloud push service.

## Access

| Permission | Capability |
|---|---|
| `calendar.view` | Open `/reminders`, topbar preview, poll API |
| `settings.manage` | Toggle firm browser-notification setting |

Matter access still applies for deadlines and hearings when the user cannot view all matters. Procedures use assignee scoping when `!viewAll`.

## UI

- Sidebar: **Reminders**
- Topbar bell: preview + badge when there are items
- Settings → **Reminders**: firm toggle + request browser permission

## Browser notifications

Optional. Only while LexZim is open in the browser:

1. Firm setting `browser_notifications_enabled` = true
2. User grants Notification permission
3. Poller alerts on **new overdue** items (not every poll)

No background push when the tab is closed.

## API

| Method | Path | Permission |
|---|---|---|
| GET | `/api/reminders` | `calendar.view` |
| GET | `/api/reminders/settings` | `calendar.view` |
| PATCH | `/api/reminders/settings` | `settings.manage` |

## Code

- Repo: `lib/repos/reminders.ts`
- UI: `components/reminders/RemindersCenter.tsx`, `BrowserNotifications.tsx`
- Setting key: `browser_notifications_enabled` in `firm_settings`

## Next

**P3-06:** Disbursements.
