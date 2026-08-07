# Phase 1 smoke test

Use after Phase 1 MVP work (P1-01 to P1-14). Automated runner:

```powershell
# App must be running
npm run dev

# Optional: Railway URL
$env:SMOKE_BASE_URL = "https://YOUR-APP.up.railway.app"

npm run smoke:phase1
# Also: npm run smoke:phase1-rbac
```

Manual / checklist mirror of the automated script:

## Checklist

| # | Check | How | Pass? |
|---|---|---|---|
| 1 | Login works on Railway URL (or local) | Open `/login` as `mp@lexzim.local` / `<set-in-env>`. Set `SMOKE_BASE_URL` for Railway. | |
| 2 | Create client → matter → procedure → timeline note | Clients → New; open matter; add procedure + timeline note. | |
| 3 | Open/closed filters | Matters list: Open vs Closed buckets. | |
| 4 | Overdue on dashboard | Seed or create a procedure with past `dueAt`; Dashboard shows overdue. | |
| 5 | Upload document | Matter → Documents → upload PDF/DOCX/TXT. | |
| 6 | Generate template docx | Documents → Generate from template (Family/Civil/Labour starters). | |
| 7 | Global search | Header search / Ctrl+K finds client or matter. | |
| 8 | Export archive | Settings → Backup & Export → download ZIP. | |
| 9 | Junior Associate scoping | `junior@lexzim.local` cannot open unassigned matters. | |
| 10 | Cross-firm isolation | Pilot user cannot open Isolation Test Firm matter UUIDs. | |
| 11 | AI page still placeholder | `/ai` still shows Phase 0 placeholder (no RAG). | |

## Credentials (dev)

| User | Email | Password |
|---|---|---|
| Managing Partner | `mp@lexzim.local` | `<set-in-env>` |
| Junior | `junior@lexzim.local` | `<set-in-env>` |
| Isolation MP | `isolation@lexzim.local` | `<set-in-env>` |

See `docs/DEV_SEEDS.md`.

## Demo data

```powershell
$env:DEV_SEED_ENABLED = "1"
npm run db:seed:phase1-demo
```

Zimbabwe-flavoured clients/matters/procedures/timeline/parties/document/templates for the pilot firm (idempotent).

## Railway note

If production URL is not set yet, run smoke locally (`http://localhost:3000`) and record the Railway URL in `docs/HOSTING.md` / README when available. Checklist item 1 then re-runs against `SMOKE_BASE_URL`.
