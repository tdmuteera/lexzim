# LexZim hosting — Railway + Supabase

LexZim is a **hosted Next.js web app**. Stack:

| Piece | Provider | Notes |
|---|---|---|
| App (frontend + API) | **Railway** | Deploy from GitHub (`railway.toml`) |
| Postgres, Auth, Storage | **Supabase** | Free tier OK for early testing |
| Vercel | **Not required** | Optional later if you split frontend |

Full Railway runbook: **`docs/RAILWAY.md`**.

## 1. Create a Supabase project (Free)

1. Sign up at [https://supabase.com](https://supabase.com).
2. Create a new project (pick a region and save the DB password).
3. Open **Settings → API** and copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (server only)
4. Open **Settings → Database** (or **Connect**) and copy the connection string:
   - **Transaction** pooler, port **6543** → `DATABASE_URL` (app runtime)
   - **Session** pooler, port **5432** → `DIRECT_URL` (migrations)
5. For AI testing, add **`GEMINI_API_KEY`** (Google AI Studio). Server only. Never commit it.

### Database connectivity (permanent fixes)

`CONNECT_TIMEOUT` / TLS reset to `*.pooler.supabase.com:6543` is a **network path** problem. The Supabase project can show Healthy while your PC cannot complete Postgres TLS.

| Permanent approach | When to use |
|--------------------|-------------|
| **Deploy app near the DB** (Railway in the same region as Supabase) | Production and stable pilots. Server-to-server usually works even when home ISP fails. |
| **VPN with clean egress** (or hotspot that does not reset TLS on 5432/6543) | Local `npm run dev` from restricted networks. |
| **Re-copy Connect strings** from Supabase → Connect → Transaction (`DATABASE_URL`, port **6543**) and Session (`DIRECT_URL`, port **5432**) | After password rotate or wrong host (`aws-0` vs `aws-1`). Encode `@` in passwords as `%40`. |
| **Session pooler as `DATABASE_URL` for local Next** (port **5432**) | Long-lived `next dev` on one machine; keep Transaction 6543 for Railway runtime. |
| **IPv4 add-on** (paid) for `db.<ref>.supabase.co` | Only if you must use the direct host from IPv4-only environments. Pooler is already IPv4. |
| **Local Postgres / Supabase CLI for development** | Fully offline local work; still point Auth/Storage at the cloud project if needed. |

There is no app code change that creates a TCP path through a firewall that resets Postgres TLS. The app shows a **Database unreachable** recovery page instead of a raw Next.js stack when the pooler times out.

### Free tier honesty (~2 months testing)

Supabase Free is fine for a small pilot if you stay within limits (DB size, storage, egress, paused projects after inactivity). Expect to upgrade later for production. Pause/sleep on unused free projects can make the app look “down” until the project wakes.

**When to leave Free / trial:** see the scale checklist in `docs/cloud/OPS_RUNBOOK.md` (PITR needed, pause hurts pilots, egress/DB pressure, live portal + SLA).

## 2. Local env file

```bash
cd lexzim
copy .env.example .env.local
```

Fill in real values. **Never commit `.env.local`.**

Generate `AUTH_SECRET` (example):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 3. Create a Railway project

1. Sign up at [https://railway.app](https://railway.app).
2. **New Project → Deploy from GitHub** (connect `tdmuteera/lexzim`, branch `master`).
3. Set the same environment variables as `.env.example` in Railway **Variables** (see `docs/PRODUCTION_SECRETS.md`).
4. Set `NEXT_PUBLIC_APP_URL` to your Railway public URL (e.g. `https://lexzim-production.up.railway.app`, no trailing slash).
5. Build and start are defined in `railway.toml`: `npm ci && npm run build`, then `npm run start`.
6. Health check path: `/api/health` (restart on failure configured in `railway.toml`).
7. After first deploy, run migrations once (Railway Shell): `npx drizzle-kit migrate` (needs `DIRECT_URL`).
8. Update Supabase **Authentication → URL configuration** (Site URL + redirects) to match `NEXT_PUBLIC_APP_URL`.

Step-by-step first deploy: **`docs/RAILWAY.md`** (staging vs production, rollback, sizing, log redaction).

Phase 5 ops hub (backup drill, portal rate limits, security headers, free-tier exit): **`docs/cloud/OPS_RUNBOOK.md`**.

Domain, SSL, and secrets checklist: **`docs/PRODUCTION_SECRETS.md`**.

### Deploy flow

```text
git push → Railway Nixpacks build → npm run start → GET /api/health
```

### Free / trial honesty

Railway often starts with trial credits, then paid usage. Prefer always-on paid usage for firm pilots so users do not see cold starts. Budget a small monthly cost once credits end.

### Production / staging URL (record when live)

| Environment | URL | Notes |
|-------------|-----|-------|
| Local | `http://localhost:3000` | Dev |
| Staging | **TBD** | Set `SMOKE_BASE_URL` for smoke scripts |
| Production | **TBD** | Set `NEXT_PUBLIC_APP_URL`; confirm `GET /api/health` |

Phase 4 release smoke: `docs/PHASE4_SMOKE_TEST.md`. Phase 8: `npm run smoke:phase8`.

## 4. Verify locally

```bash
npm run dev
```

Open:

- App: [http://localhost:3000](http://localhost:3000)
- Health: [http://localhost:3000/api/health](http://localhost:3000/api/health)

Expected JSON shape:

```json
{
  "ok": true,
  "service": "lexzim",
  "version": "0.5.0",
  "env": {
    "supabaseUrl": true,
    "databaseUrl": true,
    "serviceRole": true,
    "authSecret": true,
    "configured": true
  }
}
```

If `configured` is `false`, fill missing vars in `.env.local` (booleans show which ones).

## 5. Security reminders

- Never put `SUPABASE_SERVICE_ROLE_KEY` or `DATABASE_URL` in client code.
- Only `NEXT_PUBLIC_*` values are visible in the browser.
- Rotate keys if they ever leak into git history.
