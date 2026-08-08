# Client portal local setup (P5-02)

LexZim portal MVP lives in the **same Next.js app** on Railway at `/portal`. No separate subdomain is required yet.

## Prerequisites

- Phase 4 complete staff app running (`npm run dev` or Railway)
- Read `docs/cloud/ADR_PHASE5.md` and `docs/cloud/THREAT_MODEL.md`

## Enable / disable

| Env | Effect |
|-----|--------|
| unset (development) | Portal **enabled** so the skeleton is easy to open |
| `PORTAL_ENABLED=1` | Force enabled |
| `PORTAL_ENABLED=0` | Disabled UI; staff app unchanged; `/api/portal/health` still responds |

Add to `.env.local` when useful:

```bash
PORTAL_ENABLED=1
```

Production: set explicitly. Prefer `0` until P5-03+ auth and sharing are ready for a pilot.

## URLs

| Path | Purpose |
|------|---------|
| `/portal` | Portal home (skeleton) |
| `/portal/login` | Login placeholder (auth in P5-03) |
| `/api/portal/health` | Portal health JSON |
| `/api/health` | Main app health (unchanged) |
| `/login` | Firm staff sign-in |

## Verify

```powershell
npm run dev
# Browser: http://localhost:3000/portal
Invoke-RestMethod http://localhost:3000/api/portal/health
```

Expected health fields: `ok: true`, `portalEnabled`, `sharingEnabled: false`, `portalAuthEnabled: false`.

## Strategy note

MVP: one Railway service, path `/portal`.  
Later optional: `portal.example.com` CNAME to the same service (no second deploy required).

## Not in this step (done later)

- Share grants / matter visibility (P5-04+)
- Uploads
- Subdomain DNS

## Auth (P5-03)

See `PORTAL_AUTH.md`. After migrate `0009_phase5_portal_auth`:

```powershell
# As staff (clients.manage), invite:
# POST /api/portal/invites { clientId, email, fullName, password }
```

Open `/portal/login`.

Next: **P5-04** share-to-portal data model.
