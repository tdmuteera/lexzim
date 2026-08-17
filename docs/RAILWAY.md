# LexZim on Railway (P4-08)

Web-only SaaS deploy. No MSI/NSIS/desktop installers.

## Commands & runtime

| Item | Value |
|---|---|
| Node | **20** (`engines` in `package.json`, `.nvmrc`, `nixpacks.toml`) |
| Build | `npm ci && npm run build` (`railway.toml`) |
| Start | `npm run start` → `next start` |
| Health | `GET /api/health` (200 when required env present; else 503) |
| Restart | `ON_FAILURE`, max 5 retries (`railway.toml`) |

Config files: `railway.toml`, `nixpacks.toml`, `.nvmrc`.

## First deploy checklist (GitHub → Railway)

Use this once when going live. Repo: `https://github.com/tdmuteera/lexzim.git`, branch **`master`**.

### Stage 1: Supabase ready

1. Project awake (Free tier: wake from dashboard if paused).
2. Copy API keys and both pooler URIs (`DATABASE_URL` 6543, `DIRECT_URL` 5432).
3. Generate `AUTH_SECRET` if you do not reuse local dev secret for production.

### Stage 2: Railway service

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub**.
2. Authorize GitHub; select **tdmuteera/lexzim**, branch **master**.
3. Railway detects Node and reads `railway.toml` (build, start, health check).
4. Pick a **region close to Supabase** (same continent).
5. Note the public URL Railway assigns (e.g. `https://lexzim-production.up.railway.app`).

### Stage 3: Environment variables

Railway → your service → **Variables**. Add at minimum:

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_APP_URL` | Railway HTTPS URL, no trailing slash |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role (server only) |
| `DATABASE_URL` | Transaction pooler, port 6543 |
| `DIRECT_URL` | Session pooler, port 5432 |
| `AUTH_SECRET` | long random hex |
| `GEMINI_API_KEY` | if using managed AI |
| `PORTAL_ENABLED` | `1` if portal should be on |

Redeploy after saving variables.

### Stage 4: Migrations

Railway → service → **Shell** (or run locally against production `DIRECT_URL` once):

```bash
npx drizzle-kit migrate
```

Includes Phase 8 migration `0025_phase8_diagnostics`. Schema mismatch is not connectivity; run migrate, do not only reset the DB circuit.

### Stage 5: Supabase Auth URLs

Supabase → **Authentication → URL configuration**:

- **Site URL** = same as `NEXT_PUBLIC_APP_URL`
- **Redirect URLs** = include that origin

### Stage 6: Verify live

1. `GET https://<railway-host>/api/health` → `"ok": true`, `"configured": true`
2. `GET https://<railway-host>/api/db-status` → connected (no `postgres://` in body)
3. Login at `/login` (Managing Partner account from your Supabase data)
4. Optional ops: `/ops/diagnostics` (platform admin)

Smoke from your PC (app must be up):

```powershell
$env:SMOKE_BASE_URL = "https://YOUR-APP.up.railway.app"
npm run smoke:phase8
```

## Staging vs production

Practical split on one Railway project:

1. **Production** environment: production Supabase project + production vars + custom domain (P4-09).
2. **Staging** environment: separate Supabase project (or branch) + staging vars + `*.up.railway.app` URL.

Same GitHub repo; different Railway **environments** (or two services) with isolated `DATABASE_URL` / Supabase keys. Never point staging at production Postgres.

Suggested var differences:

| Var | Staging | Production |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | staging Railway URL | production URL / custom domain |
| `DATABASE_URL` / Supabase | staging project | production project |
| AI keys | shared test keys OK | firm/managed production keys |

## Deploy

```text
git push → Railway Nixpacks build → npm run start → healthcheck /api/health
```

1. Merge or push the release commit / tag (see `docs/RELEASING.md`).
2. Confirm build logs finish without errors.
3. Hit `https://<host>/api/health` and expect `"ok": true` and `"version": "…"`.
4. Sign in as Managing Partner; open Settings → About.

### Release command (migrations)

If migrations are not automated, run after deploy:

```bash
npx drizzle-kit migrate
```

Prefer Session/`DIRECT_URL` for migrate; Transaction pooler for runtime `DATABASE_URL`.

## Rollback

1. Railway → Deployments → select the previous successful deployment → **Redeploy**.
2. Or redeploy a prior git commit / tag.
3. DB migrations are forward-only in MVP; if a bad migration shipped, restore from firm export (support-assisted) rather than hoping for automatic down-migrations.

## Env rotation

1. Generate new secret (example): `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Update Railway Variables (and staging if needed).
3. Redeploy so all replicas pick up the new value.
4. For Supabase `service_role` / anon key rotation: update Railway + any local `.env.local`, then redeploy; revoke old keys in Supabase after traffic moves.
5. Rotate AI provider keys the same way; firm BYO keys are per-firm in vault settings.

Never paste secrets into chat logs or screenshots.

## Logging

Use `lib/ops/log.ts` (`logInfo` / `logWarn` / `logError`). API unexpected errors go through redacted JSON logs (no bearer tokens, JWTs, connection strings, proxy tokens). Avoid logging full emails or matter titles in production handlers.

## Sizing (honest)

| Tier | Guidance |
|---|---|
| Trial / hobby credits | Fine for early pilots; watch credit burn. Prefer always-on over sleeping free hosts. |
| Small paid (approx 1–2 GB RAM) | Typical for one Next.js service + light AI traffic. |
| Growth | Raise memory if OOM on build or RAG/embed bursts; consider separate AI proxy service (`docs/AI_PROXY.md`). |

CPU is usually fine for LPMS CRUD; spikes come from builds and embedding jobs. Keep knowledge pack re-ingest off peak for pilots. Heavy embed/reindex uses the `ai_jobs` queue (`docs/cloud/EMBEDDINGS_SCALE.md`); optional Railway worker: `npm run jobs:ai:loop`.

## Health response shape

```json
{
  "ok": true,
  "service": "lexzim",
  "version": "0.5.0",
  "environment": "production",
  "env": {
    "supabaseUrl": true,
    "databaseUrl": true,
    "serviceRole": true,
    "authSecret": true,
    "configured": true
  }
}
```

Booleans only; no secret values.

## Related

- `docs/cloud/OPS_RUNBOOK.md` — Phase 5 ops hub (backup drill, portal rate limits, headers, free-tier exit)
- `docs/PRODUCTION_SECRETS.md` — custom domain, SSL, secrets checklist, cookie/CORS notes
- `docs/HOSTING.md` (Supabase + first Railway setup)
- `docs/RELEASING.md` (SemVer + tags)
