# Intake conversion (P3-11)

Converts an open intake into a **client**, **matter**, and optional **opposing party**, then marks the intake `converted`.

## Preconditions

1. Intake status is open (not declined/archived/already converted).
2. Conflict check allows conversion (`clear`, or `conflict`/`possible` with Managing Partner override). See `docs/CONFLICTS.md`.
3. Caller has `intake.manage`.

## Wizard fields

| Field | Default |
|---|---|
| Client type | Individual |
| Name | Prospect name |
| Matter title | Matter summary, or `Matter: {prospect}` |
| Area of law | Intake value if valid, else Civil |
| Matter status | Open |
| Opposing party | Intake opposing party text |

Contact email/phone copy from the intake onto the new client.

## Side effects

- Creates client (`kycNotes` notes intake id)
- Creates matter with conflict status `clear` or `flagged` from the latest check
- Creates `related_parties` row with role `opposing_party` when a name is provided
- Timeline system event: "Converted from intake"
- Intake: `status=converted`, `converted_client_id`, `converted_matter_id`
- Audit: `intakes.convert`
- UI redirects to `/matters/{id}`

## API

`POST /api/intakes/[id]/convert`

## UI

Intake detail → **Convert to client + matter** panel (when conflict gate passes).

## Next

**P3-12:** Reporting pack.
