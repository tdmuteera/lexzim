# Pilot onboarding (P4-10)

Soft post-setup checklist for Managing Partners. It never blocks the app.

## Where it appears

- Dashboard: Getting started panel (`settings.manage`)
- Settings → Firm profile: name, contact, currency, invoice prefix
- Help (`/help` and `/help/[slug]`): end-user guides in `docs/user/` (P4-11)

## Checklist steps

1. Firm profile
2. Default currency
3. Invoice prefix
4. Invite users (seat-aware; solo / full seats count as done)
5. Licence / trial active
6. Configure AI (does **not** turn on web lookup)
7. First client and matter
8. Backup export (or acknowledge “I’ll schedule export”)
9. Optional sample demo data (env-gated)

## Safety defaults

- Checklist is dismissible (`onboarding_dismissed_at`); restore from dashboard
- Web lookup stays off unless an admin enables it in Settings → AI
- No telemetry auto-enable
- Demo loader never changes AI safety flags

## APIs

| Method | Path | Permission | Notes |
|--------|------|------------|--------|
| GET | `/api/onboarding` | `settings.manage` | Checklist status |
| POST | `/api/onboarding` | `settings.manage` | `dismiss`, `restore`, `acknowledge_export`, `load_demo` |
| GET/PATCH | `/api/firm/profile` | `settings.manage` | Profile + billing prefs |

## Demo data gate

`POST` action `load_demo` requires:

- Non-production: `ALLOW_ONBOARDING_DEMO=1` or `DEV_SEED_ENABLED=1`
- Production: `ALLOW_ONBOARDING_DEMO=1` only

Creates one sample client and one prospective matter, then sets `onboarding_demo_seeded_at`.
