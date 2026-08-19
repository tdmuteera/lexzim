# LexZim licensing (SaaS)

Hosted LexZim uses **per-firm SaaS licences**, not desktop signed licence files.

## Model

| Field | Meaning |
|---|---|
| `edition` | `trial` \| `solo` \| `firm` |
| `seats` | Soft seat capacity (enforced in P4-05 user create) |
| `features_json` | Feature flags for editions (expanded in P4-05) |
| `status` | `active` \| `expired` \| `revoked` |
| `issued_at` / `expires_at` | Activation window (`expires_at` null = no expiry) |

Table: `firm_licences` (one row per firm).

Default seats: trial 10, solo 2, firm 15. Default trial length: **30 days**.

## Expiry policy (no data hostage)

When a licence is **expired** or **revoked**:

- **Blocked:** creating new matters
- **Allowed:** viewing/editing existing data, billing/trust, AI (subject to keys), and **export**

Export is never disabled by licence status.

## Firm UI

Settings → **Licence** shows edition, seats, issued/expiry, status, and the expiry policy note.

API: `GET /api/licence` (`settings.manage`).

## Ops: issue / activate

### CLI (preferred for pilots)

```bash
npm run licence:backfill-trials
npm run licence:issue -- --firm-slug your-firm-slug --edition firm --seats 10 --days 365
npm run licence:issue -- --firm-id <uuid> --edition trial --days 30
npm run licence:issue -- --firm-slug your-firm-slug --revoke
```

Flags: `--edition`, `--seats`, `--days`, `--no-expiry`, `--notes`, `--revoke`, `--backfill-trials`.

### Platform admin API

`POST /api/platform/licences` (platform admin session):

```json
{
  "firmSlug": "tpfigu-attorneys",
  "edition": "firm",
  "seats": 10,
  "days": 365,
  "notes": "Pilot activation"
}
```

Revoke: `{ "firmSlug": "...", "revoke": true }`.

`GET /api/platform/licences?firmSlug=...`

## Automatic trials

- Bootstrap firm setup and platform firm create issue a 30-day trial.
- Firms missing a row get an auto trial on first licence read (grandfather) or via `licence:backfill-trials`.

## Out of scope (later)

- Payment checkout
- Desktop licence crypto
- AI proxy service (P4-06)
