# Deadlines (P3-03)

Operational filing/deadline helper using **calendar-day offsets**. Not legal advice.

## How it works

1. Create a **deadline template** (name + offset days + default calendar event type).
2. On a matter **Deadlines** tab, **Apply template** with a **trigger date**.
3. Engine computes `due_at = trigger_date + offset_days`.
4. Creates a `matter_deadlines` row; optionally a linked `calendar_events` row (all-day filing/deadline).

## Access

| Permission | Capability |
|---|---|
| `calendar.view` | List templates and matter deadlines |
| `calendar.manage` | CRUD templates, apply, update status, delete |

Matter deadlines also require matter access (`userCanAccessMatter`).

## UI

- Settings → **Deadline templates**
- Matter detail → **Deadlines** tab (overdue rows use danger styling)

## API

| Method | Path | Notes |
|---|---|---|
| GET/POST | `/api/deadline-templates` | List (active by default; `?active=all`) / create |
| GET/PATCH/DELETE | `/api/deadline-templates/[id]` | Template CRUD |
| GET/POST | `/api/matters/[id]/deadlines` | List / apply template |
| PATCH/DELETE | `/api/deadlines/[id]` | Status update / delete (also removes linked calendar event) |

## Code

- Validation: `lib/deadlines/validation.ts` (`addCalendarDays`)
- Serialize: `lib/deadlines/serialize.ts` (`isOverdue`)
- Repo: `lib/repos/calendar.ts` (`applyDeadlineTemplate`, …)

## Disclaimer

Offsets are simple calendar days (not court dies non / business days). Always verify against Rules of Court and counsel judgment.

## Next

**P3-04:** Reminders center.
