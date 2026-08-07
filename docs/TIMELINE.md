# Matter timeline + notes (P1-05)

Chronological feed of system events and user communication notes on a matter.

## UI

Matter detail → **Timeline** tab:

- Chronological feed with type badges (note, call, email, meeting, status, procedure, system)
- Filter by type
- Add entry (title, details, optional when)

## API

| Method | Path | Permission |
|---|---|---|
| `GET` | `/api/matters/[id]/timeline` | `matters.view` |
| `POST` | `/api/matters/[id]/timeline` | `matters.edit` |

Query: `type` (comma-separated), `sortDir` (`asc`\|`desc`, default `desc`).

User-authored types: `note`, `call`, `email`, `meeting`.

System types already written by other modules: `system`, `status_change`, `procedure` (documents later).

## Audit

`timeline.create` on new user entries.

## Next

**P1-06:** Related parties.
