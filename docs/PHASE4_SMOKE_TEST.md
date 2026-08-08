# Phase 4 smoke test (Sell & Ship release)

Use after P4-01 to P4-14. **Web SaaS only.** No desktop / MSI / Tauri install steps.

```powershell
npm run dev

# Preferred seeds:
$env:DEV_SEED_ENABLED = "1"
npm run db:seed:dev-users
npm run db:seed:phase1-demo
npm run db:seed:phase3-demo

# Local:
npm run smoke:phase4

# Staging or production Railway:
# $env:SMOKE_BASE_URL = "https://YOUR-APP.up.railway.app"
# npm run smoke:phase4
```

Record the URL used in `docs/HOSTING.md` when production is live.

## Credentials (dev)

| User | Email | Password |
|------|-------|----------|
| Managing Partner | `mp@lexzim.local` | `<set-in-env>` |
| Accounts | `accounts@lexzim.local` | `<set-in-env>` |
| Secretary | `secretary@lexzim.local` | `<set-in-env>` |
| Isolation MP | `isolation@lexzim.local` | `<set-in-env>` |

## Automated coverage (`npm run smoke:phase4`)

| Area | Checks |
|------|--------|
| Health / version | `/api/health` ok + version |
| Setup / auth | `/api/auth/status`, MP login |
| Licence / About | `/api/licence`, `/api/about` |
| Seats | `/api/staff` seats used/limit |
| Onboarding / profile | `/api/onboarding`, `/api/firm/profile` |
| Clients / matters / docx | lists + templates / generate reachability |
| Calendar / billing / trust / intake | list APIs |
| AI | settings, provider switch (web lookup forced off), grounded ask or clear key/budget error |
| Export | GET meta + POST archive |
| Diagnostics | safe JSON, `containsMatterData: false`, no auto-upload |
| RBAC | secretary ≠ billing/licence; accounts ≠ intake |
| Isolation | isolation firm does not see pilot invoices |

## Manual checklist

| # | Check | How | Pass? |
|---|-------|-----|-------|
| 1 | Railway URL | Open production/staging HTTPS URL; no installer | |
| 2 | Health | `GET /api/health` → ok + version | |
| 3 | First login / setup | New env: setup firm if empty; else MP login | |
| 4 | Licence + seats | Settings → Licence; invite within seats | |
| 5 | Onboarding | Dashboard checklist dismissible; Firm profile save | |
| 6 | Client / matter / docx | Create or open matter; generate template Word | |
| 7 | Calendar / billing / trust / intake | Spot-check UI; trust ≠ fees | |
| 8 | AI BYO or managed | Settings → AI keys; grounded ask in AI Assistant | |
| 9 | Provider switch | Change default provider; ask again; web lookup stays off unless chosen | |
| 10 | Export | Settings → Backup & Export download | |
| 11 | Diagnostics | Settings → About → Download diagnostics | |
| 12 | Help docs | `/help` and `/help/getting-started` render | |
| 13 | RBAC | Secretary cannot open Billing; Accounts cannot open Intake | |
| 14 | firm_id isolation | Isolation user cannot see pilot matters/invoices | |
| 15 | About / version | Settings → About matches `package.json` | |

## Prior phase smokes (optional regression)

```powershell
npm run smoke:phase0
npm run smoke:phase1
npm run smoke:phase1-rbac
npm run smoke:phase2
npm run smoke:phase3
```

## Final statement

**PHASE 4 COMPLETE — ready for Phase 5 prompts (Client Portal, privacy tooling, scale beyond free tiers)**
