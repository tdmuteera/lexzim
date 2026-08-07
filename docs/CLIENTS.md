# Clients module (P1-02)

Firm-scoped client registry: list, create, edit, detail, soft archive/restore.

## Routes

| Path | Purpose |
|---|---|
| `/clients` | Searchable list (type, archived, sort) |
| `/clients/new` | Create form (`clients.create`) |
| `/clients/[id]` | Detail + open/closed matter counts |
| `/clients/[id]/edit` | Edit form (`clients.edit`) |

## API

| Method | Path | Permission |
|---|---|---|
| `GET` | `/api/clients` | `clients.view` |
| `POST` | `/api/clients` | `clients.create` |
| `GET` | `/api/clients/[id]` | `clients.view` |
| `PATCH` | `/api/clients/[id]` | `clients.edit` |
| `POST` | `/api/clients/[id]/archive` | `clients.delete` |
| `POST` | `/api/clients/[id]/restore` | `clients.delete` |

Query params for list: `q`, `clientType`, `archived` (`active`\|`archived`\|`all`), `sort`, `sortDir`.

## Validation

- Individual: `fullName` required
- Company: `legalName` required
- Optional email must be valid format

## Audit actions

`clients.create`, `clients.update`, `clients.archive`, `clients.restore`

## Next

**P1-03:** Matters module CRUD + client detail “New matter”.
