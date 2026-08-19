# Phase 9 smoke

`npm run smoke:phase9`

Needs the app running (`SMOKE_BASE_URL`, default `http://localhost:3000`) and Managing Partner credentials (`SMOKE_MP_EMAIL` / `SMOKE_MP_PASSWORD`).

Automated:

- Did you know array has 50 facts
- Login splash source skips when `prefers-reduced-motion` is reduce
- MP can POST a calendar event
- MP cannot strip own `users.manage`
- MP creates a user with `clients.view` and without `crm.view`; that user gets 403 on `/api/crm/overview` and 200 on `/api/clients`

Manual:

- Login with reduced motion: no splash
- `/calendar`: New meeting and New event open a modal
- `/staff`: create user, ticks hide CRM in the sidebar after that user signs in
- Dashboard numbers count; zeros still move

Hosting: `railway.toml` and `Dockerfile` were not changed in Phase 9. After local sign-off, push `master` so Railway deploys. Apply migrations on the live database if Railway does not run them (`0026` to `0028`).
