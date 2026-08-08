# Phase 5 smoke test (Portal & Scale)

Use after P5-01 to P5-14. **Web SaaS only.** Portal is optional; core app must work with portal off.

```powershell
npm run dev

# Preferred seeds:
$env:DEV_SEED_ENABLED = "1"
npm run db:seed:dev-users
npm run db:seed:phase1-demo
npm run db:seed:phase3-demo

# Local (portal on by default in non-production):
npm run smoke:phase5

# Portal off regression (optional second pass):
# $env:PORTAL_ENABLED = "0"
# restart app, then npm run smoke:phase5

# Staging or production Railway:
# $env:SMOKE_BASE_URL = "https://YOUR-APP.up.railway.app"
# npm run smoke:phase5
```

Also: `npm run smoke:portal-shares` for deeper share isolation.

Record live URLs in `docs/HOSTING.md` when production is ready.

## Credentials (dev)

| User | Email | Password |
|------|-------|----------|
| Managing Partner | `mp@lexzim.local` | `<set-in-env>` |
| Accounts | `accounts@lexzim.local` | `<set-in-env>` |
| Secretary | `secretary@lexzim.local` | `<set-in-env>` |
| Isolation MP | `isolation@lexzim.local` | `<set-in-env>` |

Portal smoke invites create `portal.phase5.smoke@example.local` / `<set-in-env>` (and an isolation portal user).

## Automated coverage (`npm run smoke:phase5`)

| # | Area | Checks |
|---|------|--------|
| 1 | Portal disabled / main app | Staff clients work; `/api/portal/health` + auth flag; when off, `portalEnabled: false` |
| 2 | Share → see → revoke | Invite, matter share, portal sees matter, revoke, gone |
| 3 | Cross-tenant | Isolation portal cannot see pilot matter id |
| 4 | Session revoke | List secretary sessions, revoke registry row, absent after |
| 5 | Tenant export | `POST /api/export` ZIP |
| 6 | AI grounding | `/api/ai/ask` success or clear key/budget error |
| 7 | Trust / fee separation | Invoices and trust accounts both list (separate APIs) |
| 8 | Railway + Supabase | `/api/health` ok + env configured |

## Manual checklist

| # | Check | How | Pass? |
|---|-------|-----|-------|
| 1 | Main app, portal off | `PORTAL_ENABLED=0`; staff login; matters/billing; `/portal` not required | |
| 2 | Share → see → revoke | Matter → Portal tab: share matter; client `/portal/home`; revoke; client loses access | |
| 3 | Cross-tenant | Portal user of firm B cannot open firm A shared URLs / lists | |
| 4 | Session revoke | `/staff`: revoke a session; confirm registry update | |
| 5 | Tenant export | Settings → Backup & Export; archive includes portal tables (v3) | |
| 6 | AI grounding | AI Assistant grounded answer; web lookup stays off unless chosen | |
| 7 | Trust ≠ fees | Billing vs Trust screens; no mixed balances | |
| 8 | Health | `GET /api/health` on Railway; Supabase project awake | |

## Ops / privacy spot checks (optional)

| Check | Doc |
|-------|-----|
| Ops runbook + backup drill notes | `docs/cloud/OPS_RUNBOOK.md` |
| Portal auth rate limit (429 after burst) | `docs/cloud/PORTAL_AUTH.md` |
| AI retention purge | Settings → AI / `npm run privacy:purge-ai` |
| Privacy templates | `docs/cloud/PRIVACY.md` |

## Prior phase smokes (optional regression)

```powershell
npm run smoke:phase0
npm run smoke:phase1
npm run smoke:phase1-rbac
npm run smoke:phase2
npm run smoke:phase3
npm run smoke:phase4
npm run smoke:portal-shares
```

## Final statements

**PHASE 5 COMPLETE — limited client portal and scale/privacy tooling available**

**LEXZIM WEB PHASE ROADMAP 0–5 COMPLETE — iterate on content, integrations, and pilot feedback next**

See `docs/ROADMAP_STATUS.md`.
