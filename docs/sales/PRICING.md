# LexZim pricing (draft)

Honest commercial framing for Zimbabwe pilot sales. Numbers marked **[TBD]** until ops finalises quotes. Currency for quotes is typically **USD** unless agreed otherwise.

## What you are buying

LexZim is a **hosted web practice system** (SaaS). Your firm signs in through a browser on a secure HTTPS URL. There is no offline desktop product in this phase.

Included in a normal subscription conversation:

- Multi-user firm workspace with roles
- Clients, matters, documents, calendar, reminders
- Intake and conflict checks
- Fee billing and **trust accounting** (kept separate)
- Zimbabwe-oriented AI assistant (needs internet and configured provider keys)
- Firm export / backup snapshot
- Tenant isolation (your firm’s data is not mixed with other firms)

## Editions (list prices [TBD])

| Edition | Best for | Seats (default) | Matter cap | List price |
|---------|----------|-----------------|------------|------------|
| Trial | Evaluation | 3 | 25 total | Free for agreed trial days (default 30) |
| Solo | Very small practice | 2 | Unlimited | **[TBD]** / month or year |
| Firm | Multi-lawyer practice | 15 (customisable) | Unlimited | **[TBD]** / month or year |

Extra seats: **[TBD]** per seat per month (or included in a custom Firm quote).

AI usage: model provider costs may be **BYO keys** (firm pays the provider) or **managed** (LexZim pass-through / included allowance **[TBD]**). Soft monthly budgets exist in-product to limit surprise spend.

Optional LexZim **AI proxy** (Firm edition): **[TBD]** add-on or included tier.

## What is not included by default

- Custom on-premise install
- Guaranteed offline / air-gapped AI
- Public client portal (planned later; not in Phase 4 pilots)
- One-click restore from export (export is available; restore is support-assisted in MVP)
- Fake “lifetime local licence” positioning (see honesty notes below)

## Billing and payment [TBD]

- Invoice cycle: monthly or annual **[TBD]**
- Payment methods accepted in Zimbabwe / region: **[TBD]**
- Taxes / VAT treatment: **[TBD]**
- Pilot discounts: see `PILOT_OFFER.md`

## Licence behaviour (sales must say this)

When a paid or trial licence **expires**:

- The firm can still sign in and work existing files
- **New matters** (and intake conversion to a matter) may be blocked until renewal
- **Export always remains available** (no data hostage)

## Honesty notes for sellers

1. **Hosted web.** LexZim runs on cloud hosting (typically Railway + Supabase). Uptime depends on those providers and your internet.
2. **AI needs internet.** Grounded answers still call a model API. No internet means no AI calls.
3. **Zimbabwe-grounded AI** means knowledge pack and firm context, not a guarantee of perfect law. Lawyers remain responsible for verification.
4. **Trust accounting** is in-product and separate from fee billing. It is not a substitute for your firm’s bank reconciliations and Law Society duties.
5. **Local-data era → export + tenant isolation.** Older “everything only on this PC” tools are a different product class. LexZim’s answer for control and exit is strong tenant separation plus firm export, not a promise that data never leaves the firm’s laptop.
6. **No fake testimonials.** Do not invent client quotes. Use named references only with written permission.

## Quote checklist

- Edition, seats, term (months), start date
- AI key mode (BYO vs managed) and any budget cap
- Pilot vs full commercial terms
- Support channel and response expectations (`docs/ops/` after P4-13)

Related: `ONE_PAGER.md`, `PILOT_OFFER.md`, `docs/EDITIONS.md`, `docs/LICENSING.md`.
