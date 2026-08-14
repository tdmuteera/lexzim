# Matters module (P1-03)

Firm-scoped, matter-centric case files with status workflow and assigned-scope visibility.

## Routes

| Path | Purpose |
|---|---|
| `/matters` | List with open/closed, status, area, lawyer, search |
| `/matters/new` | Create matter (`?clientId=` prefill) |
| `/matters/[id]` | Detail hub + status change + tab stubs |
| `/matters/[id]/edit` | Edit facts |

## API

| Method | Path | Permission |
|---|---|---|
| `GET` | `/api/matters` | `matters.view` |
| `POST` | `/api/matters` | `matters.create` |
| `GET` | `/api/matters/[id]` | `matters.view` (+ access scope) |
| `PATCH` | `/api/matters/[id]` | `matters.edit` |
| `POST` | `/api/matters/[id]/status` | `matters.edit` |

List query params: `q`, `bucket` (`open`\|`closed`\|`all`), `status`, `areaOfLaw`, `clientId`, `responsibleLawyerId`, `includeLawyers=1`.

## Visibility

- Users with `matters.view_all`: all firm matters
- Others: only matters where they are `responsible_lawyer_id` or on `matter_team`

## Defaults on create

- `status`: `prospective` (unless set)
- System timeline event: "Matter created"
- Responsible lawyer added to `matter_team` when set

## Audit actions

`matters.create`, `matters.update`, `matters.status_change`

## Client linkage

Client detail lists matters and offers **New matter** (`matters.create`).

## Next

**P1-04:** Pending procedures on matter detail.
