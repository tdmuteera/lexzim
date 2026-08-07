# Calendar (P3-02)

Firm court diary: hearings, appointments, filings, deadlines, and other events.

## Access

| Permission | Capability |
|---|---|
| `calendar.view` | List and open events |
| `calendar.manage` | Create, edit, delete |

Every query is scoped by session `firm_id`. Audit actions: `calendar.create`, `calendar.update`, `calendar.delete`.

## UI

Route: `/calendar`

- **Month** grid (existing `.cal-*` styles)
- **Agenda** list for the next 60 days
- Filters: event type, matter
- Optional matter link on each event
- Google / Outlook sync: **coming later** (not in this phase)

## API

| Method | Path | Permission |
|---|---|---|
| GET | `/api/calendar?from=&to=&eventType=&matterId=` | `calendar.view` |
| POST | `/api/calendar` | `calendar.manage` |
| GET | `/api/calendar/[id]` | `calendar.view` |
| PATCH | `/api/calendar/[id]` | `calendar.manage` |
| DELETE | `/api/calendar/[id]` | `calendar.manage` |

## Code

- Repo: `lib/repos/calendar.ts`
- Validation: `lib/calendar/validation.ts`
- Serialize: `lib/calendar/serialize.ts`
- UI: `components/calendar/CalendarView.tsx`

## Related

Deadline templates and apply engine: `docs/DEADLINES.md`.

## Next

**P3-04:** Reminders center.
