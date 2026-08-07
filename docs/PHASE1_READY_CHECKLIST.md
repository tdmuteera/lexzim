# Phase 1 readiness checklist

Phase 1 can start when all boxes are true.

## Platform and hosting

- [x] App runs locally (`npm run dev`)
- [x] Build/start scripts exist (`npm run build`, `npm run start`)
- [x] Railway deploy instructions documented (`docs/HOSTING.md`)
- [ ] Railway production URL confirmed and written in README/HOSTING

## Data and auth foundations

- [x] Supabase Postgres + Auth wired
- [x] Drizzle migrations applied
- [x] RBAC roles and permissions seeded (`npm run db:seed:rbac`)
- [x] First-run setup and login/logout UI working
- [x] Session bridge via Next.js proxy

## Multi-tenant safeguards

- [x] `firms` tenant model in schema
- [x] `users.firm_id` linkage and tenant-aware session DTO
- [x] Route/API firm scoping foundations in place
- [x] Optional isolation fixture tenant via dev seed

## Authorization and UX gating

- [x] Permission-gated sidebar and route guards
- [x] Access denied page for forbidden deep links
- [x] AI nav visible based on `ai.use`

## Verification assets

- [x] Dev role seed script (`npm run db:seed:dev-users`)
- [x] Phase 0 automated smoke test (`npm run smoke:phase0`)
- [x] Manual test docs (`docs/PHASE0_AUTH_UI_TEST.md`, `docs/PHASE0_SMOKE_TEST.md`)

## Before first Phase 1 coding session

1. Confirm production URL and add it to docs.
2. Re-run:
   - `npm run db:migrate`
   - `npm run db:seed:rbac`
   - `DEV_SEED_ENABLED=1 npm run db:seed:dev-users`
   - `npm run smoke:phase0`
3. Start `PHASE 1 - MVP Prompts.md` from P1-01.