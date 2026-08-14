# Calendar (P3-02, P7-09)

Firm court diary: hearings, client meetings, filings, deadlines, and other events.

## Access

| Permission | Capability |
|---|---|
| `calendar.view` | List and open events |
| `calendar.manage` | Create, edit, delete |

Every query is scoped by session `firm_id`. Audit actions: `calendar.create`, `calendar.update`, `calendar.delete`.

## Client meetings (P7-09)

- Meetings use `event_type = appointment` with optional `client_id` on `calendar_events`.
- **New meeting** flow: search client, optional matter (filtered by client), datetime, location, notes.
- Appointments require a linked client or matter (matter implies client).
- Filter pills: **All | Meetings | Hearings** (meetings = appointments only).

### Meeting reminders

On calendar list/create/update, LexZim syncs in-app `staff_notifications` (`kind = meeting_reminder`) for appointments starting within the next 7 days. Idempotent via notification metadata `calendarEventId`.

## UI

Route: `/calendar`

- **Month** grid (existing `.cal-*` styles)
- **Agenda** list for the next 60 days
- Filters: category (meetings/hearings/all), matter
- Client name on meeting detail; matter link when set
- Google / Outlook sync: **coming later** (not in this phase)

## API

| Method | Path | Permission |
|---|---|---|
| GET | `/api/calendar?from=&to=&eventType=&matterId=` | `calendar.view` |
| POST | `/api/calendar` | `calendar.manage` |
| GET | `/api/calendar/[id]` | `calendar.view` |
| PATCH | `/api/calendar/[id]` | `calendar.manage` |
| DELETE | `/api/calendar/[id]` | `calendar.manage` |

POST/PATCH body may include `clientId` (UUID). For `appointment`, at least one of `clientId` or `matterId` is required.

## Code

- Repo: `lib/repos/calendar.ts`
- Validation: `lib/calendar/validation.ts`
- Serialize: `lib/calendar/serialize.ts`
- Client resolve: `lib/calendar/resolve-client.ts`
- Meeting notifications: `lib/calendar/meeting-notifications.ts`
- UI: `components/calendar/CalendarView.tsx`
- Migration: `drizzle/migrations/0023_phase7_calendar_client.sql`

## Related

- Dashboard widgets: `docs/DASHBOARD.md`
- Reminders center (Meetings tab): `/reminders`
- Deadline templates and apply engine: `docs/DEADLINES.md`
