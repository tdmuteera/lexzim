# Trust accounting (P3-08)

Client money held in trust. **Never mix** with fee notes or `fee_payments`.

## Access

| Permission | Who (default) | Capability |
|---|---|---|
| `trust.view` | MP, Senior, Accounts | Accounts, ledger, statements |
| `trust.manage` | MP, Accounts | Create accounts, post entries |

## Concepts

| Entry type | Signed amount | Meaning |
|---|---|---|
| `receipt` | + | Money received into trust for a client |
| `disbursement` | − | Trust payment out for a client |
| `transfer` | − then + | Move between trust accounts (two ledger rows) |
| `adjustment` | ± | Manual correction (credit increases balance) |

Balances = sum of signed `amount_cents`. Client statements include running balance.

## Negative balance rule

By default, posting a debit that would make the **client** trust balance negative is rejected. Managing Partner / Accounts may set `allowNegative: true` (audited).

## UI

Route: `/trust` (separate from `/billing`)

- Trust accounts + balances
- Ledger with filters
- Post entry form
- Client statement (printable)

## API

| Method | Path |
|---|---|
| GET/POST | `/api/trust/accounts` |
| GET/PATCH | `/api/trust/accounts/[id]` |
| GET/POST | `/api/trust/ledger` |
| GET | `/api/trust/clients/[id]/statement` |

## Code

- Repo: `lib/repos/trust.ts`
- Validation: `lib/trust/validation.ts`
- UI: `components/trust/TrustView.tsx`

## Next

**P3-10:** Conflict-of-interest search.
