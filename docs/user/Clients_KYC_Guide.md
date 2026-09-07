# Clients and KYC

Every client gets a firm-unique number (`CL0001`, `CL0002`, …) on create. Numbers cannot be changed.

Path: **Clients** (`/clients`). New client: `/clients/new`.

## Before you create

Search the list (name, CL number, phone, ID) so you do not open a duplicate.

## Compulsory fields on create

| Client type | Required |
|-------------|----------|
| Individual | First name, surname, phone, WhatsApp |
| Corporate, partnership, trust | Registered name, phone, WhatsApp |

Complete the rest of KYC on the profile as soon as you have the documents. Managing Partners set the firm standard; typical packs include ID, proof of address, and (for entities) registration plus beneficial owners.

## KYC sections

1. **Classification**: individual, corporate, partnership, or trust.
2. **Identity**: names, date of birth, nationality, ID or registration numbers, addresses, occupation or industry.
3. **Beneficial owners** (entities): repeatable UBO rows (name, control percent).
4. **Matter and funds**: purpose of representation, source of funds, PEP flag.
5. **Documents**: checklist plus file uploads on the matter or client files.
6. **Declaration**: typed signatory name and date. Status: draft, complete, or review due.

Date of birth on individuals feeds **CRM** birthday lists (`CRM_Guide.md`).

## Profile tabs

Overview, KYC, Matters, Billing, Trust. Use **Edit KYC** (`clients.kyc.manage`) to update intake fields.

Managing Partners and accounts can **Email client** from the profile once SMTP is set (`Email_Setup.md`).

## Conflict check

Before (or when) opening a new client relationship, run the conflict check and record the result: **Clear**, **Potential**, or **Blocked**. A **Blocked** result gates opening a matter until resolved per firm policy.

## Soft archive vs purge

- **Archive** a client when the relationship ends: soft archive keeps finance history.
- Firm users cannot hard-wipe live money history. Full purge of test/dummy clients is **platform ops only**.

## Permissions

| Permission | Use |
|------------|-----|
| `clients.view` | List and profile (**assigned clients only** by default) |
| `clients.view_all` | See all firm clients, not only assigned |
| `clients.create` | New client (compulsory fields enforced) |
| `clients.edit` / `clients.kyc.manage` | KYC wizard |
| `clients.delete` | Soft archive / restore (not platform purge) |

Finance Client accounts follow the same assignment rule unless the user has `finance.view_all_client_accounts`. Details: `Finance_Phase11_Guide.md`.

## Related

- `Daily_Lawyer_Guide.md`
- `CRM_Guide.md`
- `Finance_Phase11_Guide.md` (visibility + client accounts)
- `docs/CLIENTS.md` (technical)
