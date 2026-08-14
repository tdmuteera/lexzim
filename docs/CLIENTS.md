# Clients module (P1-02 + P7-04 KYC)

Firm-scoped client registry with **CL numbers**, structured KYC/AML intake, and tabbed client profile.

## Routes

| Path | Purpose |
|---|---|
| `/clients` | Searchable list (CL number, name, phone, ID) |
| `/clients/new` | KYC intake wizard (`clients.create`) |
| `/clients/[id]` | Detail tabs: Overview, KYC, Matters, Billing, Trust |
| `/clients/[id]/edit` | KYC wizard edit (`clients.kyc.manage`) |

## Client numbers

- Auto-assigned on create: `CL0001`, `CL0002`, … (4-digit, per firm)
- Unique on `(firm_id, client_number)`
- Immutable after assign (no override UI in v1)
- Shown on profile, list, debtors, trust, matter client labels

## KYC fields (Phase 7)

| Section | Fields |
|---|---|
| Classification | `client_type`: individual, corporate, partnership, trust |
| Individual | first_name*, surname*, other_names, maiden_name, DOB, nationality, id_number, address, occupation, employer |
| Entity | registered_name*, trading_name, reg_tax_number, incorporation, addresses, industry, UBO rows (`ubo_json`) |
| Contact | phone*, whatsapp*, email, alt_phone, postal address |
| Matter & funds | purpose, source_of_funds enum, PEP status |
| Documents | checklist in `kyc_documents_json` |
| Declaration | signatory, signed date, `kyc_status` |

\*Required on **create**: client_type, first_name, surname (individual), registered name (entity), phone, whatsapp.

Legacy columns (`full_name`, `legal_name`, `physical_address`, etc.) are kept in sync for reports and templates.

## API

| Method | Path | Permission |
|---|---|---|
| `GET` | `/api/clients` | `clients.view` |
| `POST` | `/api/clients` | `clients.create` (KYC core required) |
| `GET` | `/api/clients/[id]` | `clients.view` |
| `PATCH` | `/api/clients/[id]` | `clients.edit` **or** `clients.kyc.manage` |
| `POST` | `/api/clients/[id]/archive` | `clients.delete` |
| `POST` | `/api/clients/[id]/restore` | `clients.delete` |

List query: `q`, `clientType`, `archived`, `sort` (name \| number \| created \| updated), `sortDir`.

Search (`lib/repos/search.ts`) matches CL number, names, phone, WhatsApp, ID number, email.

## Permissions

| Code | Purpose |
|---|---|
| `clients.kyc.manage` | Edit KYC wizard / AML fields |

Seeded for Managing Partner, Secretary, and Accounts roles. Run `npm run db:seed:rbac` after matrix changes.

## Migration

`drizzle/migrations/0018_phase7_client_kyc.sql`

- Adds KYC columns and `client_number`
- Backfills numbers for existing rows
- Migrates `company` → `corporate`

## Reference

KYC template (local, not in repo): `C:\Users\Administrator\Desktop\kyc\Law firm kyc form.pdf`

## Next

**P7-05:** Service catalogue and quotations.
