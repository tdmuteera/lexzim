# Time tracking (P3-05)

Matter time entries with billable flag, hourly rates (integer cents), unbilled totals, and lock when linked to an invoice (ready for P3-07).

## Access

| Permission | Capability |
|---|---|
| `billing.view` | List matter time entries and totals |
| `billing.manage` | Create, edit, delete (unlocked only) |

Matter access (`userCanAccessMatter`) is also required. Roles: Managing Partner, Senior, Accounts (not Junior/Secretary by default).

## Lock rule

If `time_entries.invoice_id` is set, the entry is **locked**: edit and delete are rejected. Invoicing (P3-07) will set this FK.

## Money

- Store rates as `rate_cents` (integer) plus `currency`
- Amount = `minutes / 60 × rate_cents` (billable only)
- Default currency from `session.firm.defaultCurrency`

## UI

Matter detail → **Time** tab: add/edit/delete, unbilled totals, filters (all / unbilled / on invoice).

## API

| Method | Path | Permission |
|---|---|---|
| GET/POST | `/api/matters/[id]/time-entries` | view / manage |
| GET/PATCH/DELETE | `/api/time-entries/[id]` | view / manage |

## Code

- Repo: `lib/repos/billing.ts`
- Validation: `lib/billing/validation.ts`
- Serialize / money: `lib/billing/serialize.ts`, `lib/billing/money.ts`
- UI: `components/matters/MatterTimePanel.tsx`

## Related

Broader fee vs trust notes: `docs/BILLING.md`.

## Next

**P3-08:** Trust accounting.
