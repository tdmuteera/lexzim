# LexZim hosting — Railway + Supabase

LexZim is a **hosted Next.js web app**. Phase 0 uses:

| Piece | Provider | Notes |
|---|---|---|
| App (frontend + API) | **Railway** | Deploy from GitHub |
| Postgres, Auth, Storage | **Supabase** (Free tier OK for early testing) | Multi-tenant data |
| Vercel | **Not required** for Phase 0 | Optional later if you split frontend |

## 1. Create a Supabase project (Free)

1. Sign up at [https://supabase.com](https://supabase.com).
2. Create a new project (pick a region and save the DB password).
3. Open **Settings → API** and copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (server only)
4. Open **Settings → Database** and copy the connection string:
   - Prefer **Pooler / Transaction** mode URI for the running app → `DATABASE_URL`
   - Keep the **direct** URI handy for migrations (P0-05 may use `DIRECT_URL`)
5. For Phase 2 AI testing, add **`GEMINI_API_KEY`** (Google AI Studio). Server only. Never commit it.

### Free tier honesty (~2 months testing)

Supabase Free is fine for a small pilot if you stay within limits (DB size, storage, egress, paused projects after inactivity). Expect to upgrade later for production. Pause/sleep on unused free projects can make the app look “down” until the project wakes.

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
2. **New Project → Deploy from GitHub** (connect the LexZim repo).
3. Set the same environment variables as `.env.example` in Railway **Variables**.
4. Set `NEXT_PUBLIC_APP_URL` to your Railway public URL (e.g. `https://lexzim-production.up.railway.app`).
5. Railway should build with `npm run build` and start with `npm run start` (see `railway.toml`).
6. Health check path: `/api/health`.

### Deploy flow

```text
git push → Railway builds Next.js → start → GET /api/health
```

Until the repo is on GitHub and linked, deploy is documented but not live.

### Free / trial honesty

Railway often starts with trial credits, then paid usage. Prefer Railway over “free dynos that sleep” so pilots do not see random cold starts. Budget a small monthly cost once credits end.

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

## 5. What this step does / does not do

**Does**

- Scaffold Supabase browser + server + admin clients
- Document Railway deploy
- Expose `/api/health`

**Does not (yet)**

- Database schema / Drizzle migrations (P0-05)
- Auth login UI (P0-09)
- Real firm data

## 6. Security reminders

- Never put `SUPABASE_SERVICE_ROLE_KEY` or `DATABASE_URL` in client code.
- Only `NEXT_PUBLIC_*` values are visible in the browser.
- Rotate keys if they ever leak into git history.
