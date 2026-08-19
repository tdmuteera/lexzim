# Phase 9 ADR

Practice polish and per-person access. Closed Aug 2026.

**Hosting:** Railway + Dockerfile unchanged. No new environment variables.

**Rejected for v1:** named firm custom roles (Office Manager packs). Access is per person only.

## What shipped

| Prompt | Outcome |
|--------|--------|
| P9-01 | Tagline You will never go wrong. Did you know (50 facts). Login splash. Multi-tenant blurb and login RBAC footer removed. |
| P9-02 | Merge-field helper list removed from Documents. Template upload + approve. Client documents (including from Documents: pick a client, attach a file). |
| P9-03 | Calendar New meeting / New event open a modal. Save uses existing calendar API. |
| P9-04 | Shared AnimatedNumber on dashboard KPIs (zeros count down from 100). Fade and slight rise on module and tab changes. |
| P9-05 | Create user, job title, per-person module ticks. Protected Managing Partner. |
| P9-06 | This closeout. |

Trial login seats were raised to **10** (was 3) so firms can create staff during evaluation (`0028_phase9_trial_seats`).

## Access model (P9-05)

1. Each staff user has their own ticks on `/staff`. Ticking a sidebar item grants that item's permission (and the usual write codes for that module). Items that share a code are one tick (Calendar and Reminders, Invoicing and Debtors, and so on). Help needs no tick.
2. Grants are stored in `user_permissions` (firm scoped, unique per user and permission).
3. `getEffectivePermissionCodes` is the source for `authCurrentUser` and therefore for nav `Can` and `requirePermission`:
   - If the user has grant rows, those rows win.
   - If they have none yet, the role matrix is used (Isolation and other seeded users stay on their menus until backfill).
4. Migration `0027` copies each user's role matrix into `user_permissions` so production menus do not flicker.
5. Users with role `managing_partner` always keep `users.manage` and `dashboard.view`. They cannot save a tick set that removes their own User access.
6. Five system roles remain for fallback and for the protected MP `role_id`. Portal users are out of scope.
7. Job title is free text on `users.job_title`. It is not a custom role.

## Login (P9-01)

- Tagline: You will never go wrong.
- Did you know: `docs/PHASE9_DID_YOU_KNOW.md` and `lib/auth/did-you-know.ts` (50 facts). One fact per login/setup mount.
- Splash: first visit in a tab, about 1.1s, `sessionStorage` key `lz_auth_splash_played`. `prefers-reduced-motion: reduce` skips splash (JS and CSS).

## Calendar (P9-03)

New meeting and New event open `components/ui/Modal.tsx`. Title is focused. Meeting type is Appointment. New event defaults to Other. No Google/Outlook sync.

## Motion (P9-04)

`components/ui/AnimatedNumber.tsx`. Reduced motion: final number only, no page enter animation.

## Documents (P9-02)

The Documents merge-field list is gone. Merge still runs in `lib/templates`. Practitioner review notice stays. Client files may have a null matter (`0026`).

## Smoke

`npm run smoke:phase9` (facts count, splash reduced-motion source, calendar create, staff ticks vs CRM). Manual: create a user with Clients on and CRM off, confirm CRM is hidden.

## Related

- `docs/user/Admin_Guide.md` (create user + ticks)
- `docs/AUTH.md` (effective permissions)
- `docs/PHASE9_SMOKE_TEST.md`
- `docs/PHASE9_DID_YOU_KNOW.md`
