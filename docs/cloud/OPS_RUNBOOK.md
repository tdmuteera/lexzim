# Ops runbook (Phase 5 / P5-13)

Single hub for staging vs production, Railway rollback, Supabase backup/restore drills, structured logs, portal auth limits, security headers, and when to leave free tiers.

Pilot day-to-day steps stay in `docs/ops/PILOT_RUNBOOK.md`. Hosting setup: `docs/HOSTING.md`. Railway detail: `docs/RAILWAY.md`. Firm ZIP export: `docs/BACKUP.md`.

## Staging vs production

| | Staging | Production |
|--|---------|------------|
| Railway | Separate environment or service | Production environment + custom domain |
| Supabase | Separate project (or branch) | Production project |
| `NEXT_PUBLIC_APP_URL` | Staging Railway URL | Production HTTPS URL |
| Data | Fake / pilot copies only | Live firm data |
| Portal | Optional (`PORTAL_ENABLED=1`) for QA | Enable only when policy + URL are ready |

Never point staging `DATABASE_URL` at production Postgres. Full var notes: `docs/RAILWAY.md`.

## Railway rollback

1. Railway → service → **Deployments**.
2. Open the last known-good deployment → **Redeploy**.
3. Or redeploy a prior git tag / commit (`docs/RELEASING.md`).
4. Confirm `GET /api/health` returns `"ok": true` and expected version.
5. Spot-check: staff login, one matter list, portal login if enabled.

Migrations are forward-only in MVP. A bad migration needs support-assisted restore (firm export + Supabase restore), not automatic down-migration.

## Supabase backup / restore drill

Platform backups are separate from **Settings → Backup & Export** (firm ZIP).

### Quarterly drill (owner: platform ops)

1. Confirm project plan: daily backups and/or PITR window (Supabase dashboard → Database → Backups). Record window length and who can click Restore.
2. Prefer drill on **staging** or a disposable clone project, not live production.
3. Trigger restore per Supabase docs for your plan (PITR to a timestamp, or restore a daily backup). Note start/end wall time.
4. Point a throwaway Railway staging env (or local) at the restored DB only if keys/URLs match that project.
5. Verify:
   - `GET /api/health` ok
   - One staff Managing Partner login
   - One portal login (if portal data exists on that project)
   - One firm export still works (`POST /api/export`)
6. Tear down the disposable restore target. Do not leave old production URLs pointed at a restored clone.
7. File the drill date, duration, and gaps in your ops notes.

Honesty: Free-tier projects may lack PITR. Production with client portal traffic should budget for a plan that supports restore you can actually rehearse.

## Structured logs

Use `lib/ops/log.ts` (`logInfo` / `logWarn` / `logError`). Lines are JSON with `level`, `scope`, `message`, `meta`, `ts`. Secrets and full emails are redacted.

View in Railway → service → **Logs**. Filter by `"scope":"portal.auth"` or `"level":"error"`.

Portal auth throttles log `portal.auth` / `rate_limited` (IP only, no passwords).

## Portal auth rate limits

`POST /api/portal/auth` (password, magic request, token consume; not logout):

- **20 attempts per client IP per 15 minutes** (in-memory, per Railway replica)
- Over limit → HTTP **429** `rate_limited`
- Multi-replica: move to Redis or an edge limiter before heavy traffic

Details: `docs/cloud/PORTAL_AUTH.md`.

## Security headers

Set in `next.config.ts` for all routes:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Frame-Options: SAMEORIGIN`
- `Permissions-Policy` (camera/geolocation off; microphone allowed for same-origin AI dictate)
- `Strict-Transport-Security` (assume HTTPS in production)

CSP is shipped as **Content-Security-Policy-Report-Only** in `next.config.ts` (does not block yet; review browser reports before enforcing).

Data API / RLS lockdown: `docs/SECURITY.md` and migration `0058_supabase_data_api_lockdown`. Verify with `npx tsx scripts/verify-data-api-lockdown.ts`.

## Scale checklist: when to leave free tiers

| Signal | Action |
|--------|--------|
| Supabase Free pauses / sleep breaks pilots | Upgrade (typically Pro) for always-on |
| DB size, storage, or egress near Free limits | Upgrade before launch with live clients |
| Need PITR / reliable restore drill for live data | Paid plan with backups you can rehearse |
| Railway trial credits ending; need predictable always-on | Paid Railway usage (avoid sleeping free dynos) |
| OOM on build or embed bursts | Raise Railway memory; optional `jobs:ai:loop` worker |
| Multiple replicas + portal auth | Replace in-memory rate limit with shared store |
| Live client portal + SLA expectations | Paid Supabase + paid Railway; staging isolated |

Also see sizing notes in `docs/RAILWAY.md` and free-tier honesty in `docs/HOSTING.md`.

## Quick health

```text
GET /api/health
GET /api/db-status
GET /api/portal/health   (when PORTAL_ENABLED)
```

Ops console (platform admin): `/ops` (`docs/cloud/ADMIN.md`).

## Phase 8 diagnostics

For request timelines, Diagnose, allowlisted runtime heal, and patch proposals, use `/ops/diagnostics` and the DevOps guide:

- `docs/PHASE8_RUNBOOK.md`
- `docs/PHASE8_RUNTIME_HEAL.md`
- `docs/PHASE8_PATCH_PROPOSALS.md`

Smoke: `npm run smoke:phase8` (app must be running).

## Related

- `docs/ops/PILOT_RUNBOOK.md`, `SUPPORT_TRIAGE.md`
- `docs/BACKUP.md`, `docs/cloud/RETENTION.md`
- `docs/cloud/THREAT_MODEL.md` (T1 rate-limit)
- `docs/PRODUCTION_SECRETS.md`
- `docs/PHASE8_RUNBOOK.md` (diagnostics triage)