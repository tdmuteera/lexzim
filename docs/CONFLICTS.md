# Conflicts (P3-10)

Firm-scoped conflict-of-interest search for intakes. This is an **operational helper**, not legal advice, and does not replace counsel judgment or a full conflicts review.

## Scope

Searches only within the signed-in user's `firm_id`:

| Source | Fields |
|---|---|
| Clients | full name, legal name, trading name, ID/reg, email |
| Related parties | name, contact, notes |
| Matters | title, description, case number, court, file ref, matter number |
| Other intakes | prospect name, opposing party, summary |

The intake under review is excluded from self-matches.

## Results

| Result | Meaning |
|---|---|
| `clear` | No hits |
| `possible` | Partial (substring) matches only |
| `conflict` | At least one exact (normalized) name/value match |

Each run is saved to `conflict_checks` with query, result, checked-by, and hit summary in notes.

## Conversion gate

Before P3-11 conversion:

1. A conflict check must have been run.
2. Result must be `clear`, **or**
3. Result is `conflict` / `possible` **and** a Managing Partner has recorded an audited override.

## Partner override

Only `managing_partner` may override. Requires a written reason (min 8 characters). Audit action: `conflicts.partner_override`. Result stays `conflict`/`possible`; override is stored on the check notes.

## UI

Intake detail (`/intake/[id]`): **Run check**, hit table, conversion readiness banner, MP override form when needed.

## API

| Method | Path | Permission |
|---|---|---|
| POST | `/api/intakes/[id]/conflicts` | `intake.manage` |
| POST | `/api/intakes/[id]/conflicts/override` | `intake.manage` + Managing Partner role |
| GET | `/api/intakes/[id]` | includes latest hits, conversion gate, disclaimer |

Optional body for run: `{ "query": "Custom; Terms" }` (default: prospect name + opposing party).

## Disclaimer

Conflict search is an operational helper within this firm only. It is not legal advice and does not replace counsel judgment or a full conflicts review.

## Next

**Done for conflicts.** Conversion wizard is P3-11 (`docs/INTAKE_CONVERT.md`).
