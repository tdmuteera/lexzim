# Releasing LexZim (Railway SaaS)

LexZim is a hosted web app. There is no Windows installer or desktop auto-update. A release is: bump SemVer → changelog → git tag → Railway deploy.

## Single source of version

1. `package.json` → `"version"`
2. `lib/release/version.ts` → `APP_VERSION` (must match)

About / Settings reads `APP_VERSION` via `GET /api/about`.

## Checklist

1. **Finish work** on the release branch; smokes green locally as needed.
2. **Bump version** (SemVer):
   - PATCH for fixes
   - MINOR for Phase features
   - MAJOR only for breaking API/data contracts
3. Update `CHANGELOG.md` under the new version heading (move items out of Unreleased).
4. Sync `lib/release/version.ts` `APP_VERSION` with `package.json`.
5. Commit, for example: `release: v0.4.0`
6. **Tag:**
   ```bash
   git tag -a v0.4.0 -m "LexZim v0.4.0"
   git push origin HEAD
   git push origin v0.4.0
   ```
7. **Railway:** deploy the tagged commit (or let production track `main` after merge). Confirm:
   - Build succeeds
   - `/api/health` returns 200
   - Settings → About shows the new version

See `docs/RAILWAY.md` for staging/production split, rollback, sizing, and env rotation.
8. **Migrations:** run `npx drizzle-kit migrate` against production DB if the release includes SQL (or use your Railway release command).
9. Smoke a Managing Partner login on the production URL.

## Rollback

Redeploy the previous Railway deployment / prior git commit. Database migrations are forward-only in MVP; restore from export if a migration must be undone (support-assisted).

## What we do not ship

- MSI/NSIS installers
- Client-side “update available” prompts (SaaS deploys are immediate)
- Embedding provider master keys in the browser

## Related

- `CHANGELOG.md`
- `docs/AI_PROXY.md`, `docs/LICENSING.md`, `docs/HOSTING.md`
