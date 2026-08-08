# LexZim editions (Trial / Solo / Firm)

Commercial feature flags and seat limits from the firm licence (P4-05). Export is never disabled by edition or expiry.

## Editions

| | Trial | Solo | Firm |
|---|---|---|---|
| Seats (default) | 3 | 2 | 15 |
| Matter cap | 25 total | Unlimited | Unlimited |
| Duration | Time-limited (default 30 days) | Dated licence | Dated licence |
| Trust / Billing / Calendar / Intake / Reports | Yes | Yes | Yes |
| AI (BYO or managed server keys) | Yes | Yes (BYO-oriented) | Yes |
| LexZim AI proxy eligible | No | No | Yes (`ai_proxy`) |
| Export | Always | Always | Always |

Feature keys: `trust`, `reports`, `intake`, `billing`, `calendar`, `ai`, `ai_byo`, `ai_proxy`, `export`.

## API: `canUse`

```ts
import { canUse, assertCanUse, assertSeatAvailable, assertCanCreateMatter } from "@/lib/licensing/policy";

await assertCanUse(firmId, "trust");
await assertSeatAvailable(firmId);      // before inviting a user
await assertCanCreateMatter(firmId);    // expiry + trial matter cap
```

Resolved flags = edition defaults merged with `features_json` overrides. `export` is forced **true**.

## Enforcement

| Gate | Where |
|---|---|
| Seats | `POST /api/staff` invite |
| Matter cap / expiry | `POST /api/matters`, intake convert |
| `trust` | Trust APIs |
| `reports` | Reports API |
| `intake` | Intake list/create |
| `ai_proxy` | Reserved for P4-06 proxy mode |
| Export | Never blocked by licence |

## Firm UI

- Settings → Licence: edition, seats used, matter cap, feature list
- Lawyers & Staff: invite form respects remaining seats

## Ops notes

Pilot firms with more seeded users than trial seats can still log in; new invites are blocked until seats are raised:

```bash
npm run licence:issue -- --firm-slug t-pfigu-attorneys --edition firm --seats 15 --days 365
```

See also `docs/LICENSING.md`.
