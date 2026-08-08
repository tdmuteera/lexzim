# Production secrets & domain (P4-09)

**No real secrets belong in this file.** Use Railway Variables and Supabase dashboards only.

LexZim is same-origin Next.js + Supabase Auth cookies. Pilots may stay on `*.up.railway.app`; custom domain is optional polish.

## Custom domain + SSL (Railway)

1. Railway service → **Settings → Networking → Custom Domain**.
2. Add `app.yourfirm.example` (or apex if preferred).
3. Create the DNS records Railway shows (usually CNAME to `*.up.railway.app`).
4. Wait for Railway to provision **TLS** (Let's Encrypt). Status must be ready before cutover.
5. Set `NEXT_PUBLIC_APP_URL=https://app.yourfirm.example` (no trailing slash) and **redeploy**.
6. In Supabase → **Authentication → URL configuration**:
   - Site URL = same HTTPS origin
   - Redirect URLs include that origin (and `/` paths you use)

SSL terminates on Railway. Do not disable HTTPS for production cookies.

### Pilot on `*.up.railway.app`

| Pros | Cons |
|---|---|
| Zero DNS; TLS included | Long URL; less brand trust |
| Fine for closed pilots | Changing URL later means updating `NEXT_PUBLIC_APP_URL` + Supabase Site URL |

Tradeoff: start on Railway subdomain for smoke/pilot, add custom domain before broader rollout.

## Secrets checklist (Railway)

Mark each set in **Production** (and Staging separately).

### Public (browser-safe)

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_APP_URL` | Canonical HTTPS origin (Railway URL or custom domain) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (RLS / user session) |

### Server only (never `NEXT_PUBLIC_*`)

| Variable | Purpose |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Admin Auth + privileged server ops |
| `DATABASE_URL` | Postgres pooler (transaction) for runtime |
| `DIRECT_URL` | Session/direct URI for `drizzle-kit migrate` (CI/ops) |
| `AUTH_SECRET` | App vault / pepper fallback (generate long random) |
| `GEMINI_API_KEY` | Managed Gemini (optional if BYO only) |
| `ANTHROPIC_API_KEY` | Managed Claude (optional) |
| `OPENAI_API_KEY` | Managed OpenAI (optional) |
| `AI_VAULT_SECRET` | Optional BYO key encryption (else `AUTH_SECRET`) |
| `AI_PROXY_URL` | Optional standalone proxy base URL |
| `AI_PROXY_TOKEN_PEPPER` | Optional proxy token hash pepper |
| `SUPABASE_STORAGE_BUCKET` | Optional; default `firm-files` |

`APP_URL` may mirror `NEXT_PUBLIC_APP_URL` as a server alias; prefer setting the `NEXT_PUBLIC_` value so client and server agree.

### Generate secrets

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Rotate Supabase service role key

1. Supabase → **Settings → API** → create/rotate `service_role` (follow current Supabase UI).
2. Put the **new** key in Railway Variables (`SUPABASE_SERVICE_ROLE_KEY`).
3. Redeploy LexZim so all replicas load the new key.
4. Confirm `/api/health` → `serviceRole: true` and a Managing Partner can sign in / invite.
5. Revoke or disable the **old** service role material in Supabase after traffic is healthy.
6. Update any local `.env.local` used by ops only; never commit it.

Anon key rotation: update `NEXT_PUBLIC_SUPABASE_ANON_KEY`, redeploy, then revoke old anon if Supabase allows. Users may need to sign in again if sessions invalidate.

## Auth cookies & CORS

### Cookies

- Session cookies are set by `@supabase/ssr` via the Next.js proxy (`lib/supabase/proxy.ts`).
- In production with `https://` `NEXT_PUBLIC_APP_URL`, LexZim forces **`Secure`** and default **`SameSite=Lax`**.
- Do not set a cross-site cookie `Domain` unless you intentionally share auth across subdomains (not required for MVP).
- Local `http://localhost` keeps non-Secure cookies for development.

### CORS

- Browser UI and `/api/*` are **same origin**. No public CORS allowlist is required for the LexZim app itself.
- Do not open `Access-Control-Allow-Origin: *` on authenticated APIs.
- Supabase JS talks to `*.supabase.co` from the browser with the anon key; configure Supabase Auth URLs (above), not Railway CORS, for login redirects.
- Server-side `service_role` and `DATABASE_URL` never ship to the browser.

## Cutover checklist

1. [ ] Custom domain DNS + Railway TLS ready (or accept `*.up.railway.app` for pilot)
2. [ ] `NEXT_PUBLIC_APP_URL` matches the live HTTPS origin
3. [ ] All server secrets set; health `configured: true`
4. [ ] Supabase Site URL / redirect URLs updated
5. [ ] Smoke login + Settings → About
6. [ ] Staging uses a **different** Supabase project / DB than production

## Related

- `docs/RAILWAY.md` — deploy, rollback, sizing
- `docs/HOSTING.md` — first-time Supabase + Railway
- `docs/RELEASING.md` — version tags
- `.env.example` — names only
