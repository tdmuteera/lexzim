# Related parties (P1-06)

Opposing parties, witnesses, and other linked people on matters and clients.

## UI

- Matter detail → **Parties** tab (quick add opposing party)
- Client detail → Related parties section

## API

| Method | Path | Permission |
|---|---|---|
| `GET`/`POST` | `/api/matters/[id]/parties` | `matters.view` / `matters.edit` |
| `GET`/`POST` | `/api/clients/[id]/parties` | `clients.view` / `clients.edit` |
| `PATCH`/`DELETE` | `/api/parties/[id]` | `matters.edit` or `clients.edit` |
| `GET` | `/api/parties?q=` | `matters.view` (firm-wide name search) |

## Roles

`opposing_party`, `spouse`, `witness`, `counsel`, `expert`, `guardian`, `beneficiary`, `co_accused`, `other`

## Audit

`parties.create`, `parties.update`, `parties.delete`

Matter adds/removes also write a system timeline event.

## Next

**P1-07:** Matter documents (Supabase Storage).
