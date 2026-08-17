# LexZim on Render

Web-only Next.js deploy. Postgres, Auth, and Storage stay on **Supabase**. This does not replace Railway docs; use whichever host you run.

Node **20**. Build `npm ci --include=dev && npm run build`. Start `npm run start`. Health `GET /api/health`.

## Plan honesty

| Plan | Notes |
|---|---|
| **Starter** (recommended for pilots) | Always on. `preDeployCommand` can run `drizzle-kit migrate`. |
| Free | Sleeps after idle. Cold starts look like outages. Pre-deploy may be unavailable. Prefer Starter for a real firm pilot. |

Pick a Render **region close to your Supabase project** (same continent). Distant regions make pooler TLS slow or trip the DB circuit.

## 1. Push this repo to GitHub

Render deploys from GitHub (`https://github.com/tdmuteera/lexzim.git`, branch `master`).

## 2. Create the web service

### Option A: Blueprint (`render.yaml`)

1. Open [https://dashboard.render.com](https://dashboard.render.com).
2. **New → Blueprint**.
3. Connect the LexZim GitHub repo if asked.
4. Confirm service name `lexzim`, plan **Starter**, and apply.

### Option B: Manual Web Service

1. **New → Web Service** → this repo, branch `master`.
2. Runtime: **Node**.
3. Build command: `npm ci --include=dev && npm run build`
4. Start command: `npm run start`
5. Health check path: `/api/health`
6. Instance: **Starter** (or Free only for a sleeping trial).

## 3. Environment variables

Set these in Render → service → **Environment**. Never commit real values.

Copy from `.env.example` / local `.env.local` (local file stays on your machine).

### Required

| Variable | Source |
|---|---|
| `NEXT_PUBLIC_APP_URL` | Render URL, e.g. `https://lexzim.onrender.com` (no trailing slash). Update again if you add a custom domain. |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role (server only) |
| `DATABASE_URL` | Supabase **Transaction** pooler URI, port **6543** |
| `DIRECT_URL` | Supabase **Session** pooler URI, port **5432** (migrations) |
| `AUTH_SECRET` | Long random hex (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) |

### Typical optional

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Managed Gemini |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | Other managed AI |
| `PORTAL_ENABLED` | `1` to keep `/portal` on |
| `SMTP_*` | Shared email fallback (firm SMTP in Settings still wins) |

`NODE_VERSION=20` and `NODE_ENV=production` are set in `render.yaml`. Render also injects `PORT`; `next start` uses it.

Encode `@` in the database password as `%40`. Re-copy Connect strings if the host is `aws-0-` vs `aws-1-`.

## 4. Supabase Auth URLs

After the first Render URL exists:

1. Supabase → **Authentication → URL configuration**.
2. Site URL = `https://<your-service>.onrender.com` (or custom domain).
3. Redirect URLs include that origin.

## 5. Migrations

Blueprint **Starter** runs `npx drizzle-kit migrate` as `preDeployCommand` (needs `DIRECT_URL`).

If you are on Free, or pre-deploy is skipped, run once from **Render Shell** on the service:

```bash
npx drizzle-kit migrate
```

Phase 8 needs migration `0025_phase8_diagnostics`. Schema mismatch is not a connectivity failure; do not use diagnostics `circuit_reset` to fix missing tables.

## 6. First live checks

1. `https://<host>/api/health` → `"ok": true`, `"configured": true`.
2. `https://<host>/api/db-status` → connected; body must not contain `postgres://`.
3. Sign in as Managing Partner.
4. Platform ops: `/ops` and `/ops/diagnostics`.

If health is 503, a required env var is missing (`configured: false`).

## 7. Custom domain

1. Render service → **Settings → Custom Domains**.
2. Add the hostname and create the DNS records Render shows.
3. Wait for TLS.
4. Set `NEXT_PUBLIC_APP_URL=https://app.yourfirm.example` and redeploy.
5. Update Supabase Site URL and redirects to match.

## Rollback

Render → **Deploys** → previous successful deploy → **Redeploy**. Migrations are forward-only; a bad migration needs a support-assisted restore, not an automatic down-migration.

## Related

- `docs/HOSTING.md` (Supabase)
- `docs/PRODUCTION_SECRETS.md`
- `docs/PHASE8_RUNBOOK.md` (diagnostics after go-live)
- `docs/RAILWAY.md` (if you stay on Railway instead)
