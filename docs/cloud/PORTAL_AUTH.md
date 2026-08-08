# Portal authentication (P5-03)

Portal clients are **not** staff users. Auth is separate from Supabase staff sessions.

## Model

| Table | Purpose |
|-------|---------|
| `portal_users` | `firm_id` + `client_id` + email; optional password hash |
| `portal_magic_links` | One-time hashed tokens (30 minutes) |

Session cookie: **`lz_portal_session`** (HMAC-signed payload, **8 hours**, httpOnly).  
Production HTTPS: `Secure` + `SameSite=Lax` via `withProductionCookieOptions`.

Secret: `PORTAL_SESSION_SECRET` or fallback `AUTH_SECRET`.

## Client flows

| Method | Path | Body |
|--------|------|------|
| GET/POST | `/api/portal/auth` | password login, magic link request/consume, logout |
| GET | `/portal/login` | UI |
| GET | `/portal/home` | Requires portal session |

Password login: `{ email, password, firmSlug? }`  
Magic request: `{ email, magicLink: true, firmSlug? }`  
Magic consume: `{ token }` or `?token=` on login page  
Logout: `{ logout: true }` or Sign out on `/portal/home`

In development (or `PORTAL_RETURN_MAGIC_LINK=1`), magic link URLs are returned in JSON (email sending not wired yet).

## Staff invite

`POST /api/portal/invites` (`clients.edit` or `clients.create`):

```json
{
  "clientId": "…",
  "email": "client@example.com",
  "fullName": "Jane Client",
  "password": "<set-in-env>",
  "createMagicLink": true
}
```

`GET /api/portal/invites` lists portal users for the firm.

## Rate limits (P5-13)

`POST /api/portal/auth` (password login, magic link request, magic token consume; logout is not limited):

- 20 attempts per client IP per 15 minutes (in-memory; per Railway replica)
- Over limit: HTTP 429, code `rate_limited`
- Structured warn log: scope `portal.auth`, message `rate_limited`

Multi-replica or high traffic: replace with Redis or an edge limiter (`docs/cloud/OPS_RUNBOOK.md`).

## TLS

Production must use HTTPS (`NEXT_PUBLIC_APP_URL=https://…`). Portal cookies then set `Secure`.

## Audit

`portal.login`, `portal.login_failed`, `portal.logout`, `portal.user_invited`, `portal.magic_link_requested`.

## Setup

1. `npx drizzle-kit migrate` (migration `0009_phase5_portal_auth`)
2. `PORTAL_ENABLED=1`
3. Invite a portal user for an existing client
4. Open `/portal/login`

See also `DEV_SETUP_PORTAL.md`.
