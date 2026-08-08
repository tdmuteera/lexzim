# Intake (P3-09)

In-app prospect capture. **No public portal** (Phase 5). **Does not auto-create clients** on save (conversion is P3-11).

## Access

| Permission | Capability |
|---|---|
| `intake.view` | List and open intakes |
| `intake.manage` | Create, edit, decline, archive |

## Statuses

| Status | Meaning |
|---|---|
| `open` (also legacy `draft` / `submitted`) | Active prospect |
| `declined` | Not taking the matter |
| `archived` | Closed without conversion |
| `converted` | Linked client/matter (set in P3-11) |

## Fields

Prospect name, contact email/phone, area of law, matter summary, **opposing party** text, assignee.

## Conversion

Open intakes can be converted via the detail wizard when the conflict gate passes. Creates client + matter + optional opposing party. See `docs/INTAKE_CONVERT.md`.

## UI

- `/intake` list
- `/intake/new`
- `/intake/[id]` detail (conflict run + override + convert wizard)
- `/intake/[id]/edit`

## API

| Method | Path |
|---|---|
| GET/POST | `/api/intakes` |
| GET/PATCH | `/api/intakes/[id]` |
| POST | `/api/intakes/[id]/conflicts` |
| POST | `/api/intakes/[id]/conflicts/override` |
| POST | `/api/intakes/[id]/convert` |

## Next

**P3-12:** Reporting pack.
