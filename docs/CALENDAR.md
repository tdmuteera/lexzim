# Calendar (P3-02, P7-09, P10-12)

Firm court diary: hearings, client meetings, filings, deadlines, and other events.

## Access

| Permission | Capability |
|---|---|
| `calendar.view` | List and open events (subject to privacy) |
| `calendar.manage` | Create, edit, delete (creator, or manage + can view) |

Every query is scoped by session `firm_id`. Audit actions: `calendar.create`, `calendar.update`, `calendar.visibility_change`, `calendar.delete`, `calendar.color_update`.

## Privacy (P10-12)

| Visibility | Who sees it |
|---|---|
| `private` (default for **new** events) | Creator only |
| `firm` | Anyone with `calendar.view` |
| `people` | Creator + users in `calendar_event_shares` |

Existing diary rows were backfilled to `firm` so pre-Phase-10 behaviour was preserved.

### Tabs

| Tab | API `scope` | Contents |
|---|---|---|
| My calendar | `mine` (default) | Events you created (all visibilities); synthetic matter hearings if you are responsible lawyer |
| Firm calendar | `firm` | Events with `visibility = firm` (including own); synthetic matter hearings with matter-access gating |
| Shared with me | `shared` | `people` events shared to you (excludes ones you created) |

Managing Partner does **not** auto-see others' private events unless firm visibility or an explicit share.

### Colour

Each user may set a persistent `users.calendar_color` (hex). When their events are visible to others, the UI paints that colour. Set via the colour control on `/calendar` (`PATCH /api/calendar/color`). `GET /api/calendar` also returns `myCalendarColor`.

## Client meetings

- Meetings use `event_type = appointment` with optional `client_id` / `matter_id`.
- **Mandatory fields:** title + location. Client and matter are optional even for appointments.
- Day click or double-click opens create for that date (default timed window **08:00–09:00**).
- Filter pills: **All | Meetings | Hearings** (secondary to privacy tabs).

### Meeting reminders

On calendar list/create/update, LexZim syncs in-app `staff_notifications` (`type = meeting_reminder`) for appointments starting within the next 7 days. Recipients: event creator (if set) **and** shared people. Idempotent via metadata `calendarEventId` + `userId`.

## UI

Route: `/calendar`

- Privacy tabs: My / Firm / Shared with me
- **Month** grid (existing `.cal-*` styles); click/double-click day to create
- **Agenda** list for the next 60 days
- Visibility select + people multi-select on create/edit
- Visibility badge on the detail panel
- Google / Outlook sync: **coming later** (not in this phase)

## API

| Method | Path | Permission |
|---|---|---|
| GET | `/api/calendar?from=&to=&eventType=&matterId=&scope=mine\|firm\|shared` | `calendar.view` |
| POST | `/api/calendar` | `calendar.manage` |
| GET | `/api/calendar/[id]` | `calendar.view` (privacy enforced) |
| PATCH | `/api/calendar/[id]` | `calendar.manage` + can edit |
| DELETE | `/api/calendar/[id]` | `calendar.manage` + can edit |
| GET/PATCH | `/api/calendar/color` | `calendar.view` |

POST/PATCH body may include `visibility` (`private` \| `firm` \| `people`), `sharedUserIds` (required non-empty when `people`), `clientId`, `matterId`, and must include non-empty `title` and `location`.

## Code

- Repo: `lib/repos/calendar.ts`
- Validation: `lib/calendar/validation.ts` (`CALENDAR_VISIBILITIES`)
- Serialize: `lib/calendar/serialize.ts`
- Client resolve: `lib/calendar/resolve-client.ts`
- Meeting notifications: `lib/calendar/meeting-notifications.ts`
- UI: `components/calendar/CalendarView.tsx`
- Migrations: `0023_phase7_calendar_client.sql`, `0042_calendar_privacy.sql`

## Related

- Dashboard widgets: `docs/DASHBOARD.md`
- Reminders center (Meetings tab): `/reminders`
- Deadline templates and apply engine: `docs/DEADLINES.md`
- Phase 10 ADR: `docs/PHASE10_ADR.md`
