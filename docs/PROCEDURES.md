# Pending procedures (P1-04)

Matter-scoped tasks/deadlines with overdue highlighting and a dashboard query stub.

## UI

Matter detail → **Procedures** tab:

- List open/all procedures
- Overdue rows highlighted
- Add / edit (title, description, due, assignee)
- Mark done / cancel / reopen

## API

| Method | Path | Permission |
|---|---|---|
| `GET` | `/api/matters/[id]/procedures` | `matters.view` |
| `POST` | `/api/matters/[id]/procedures` | `matters.edit` |
| `PATCH` | `/api/procedures/[id]` | `matters.edit` |
| `POST` | `/api/procedures/[id]/status` | `matters.edit` |
| `GET` | `/api/procedures/mine?mode=upcoming\|overdue\|all_open` | `matters.view` |

Matter access follows P1-03 (`matters.view_all` vs assigned).

`/api/procedures/mine`:

- Without `view_all`: procedures assigned to the current user
- With `view_all`: all firm open (`todo`) procedures
- Modes: `upcoming`, `overdue`, `all_open`

## Timeline + audit

Creating and status changes write:

- Timeline `eventType: procedure`
- Audit: `procedures.create`, `procedures.update`, `procedures.status_change`

## Next

**P1-05:** Matter timeline + notes UI.
