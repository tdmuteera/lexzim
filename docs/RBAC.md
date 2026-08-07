# LexZim RBAC (Phase 0 + Phase 1)

Email is **unique globally** for MVP. Users belong to one `firm_id`.

**Rule:** every firm-scoped query MUST filter `firm_id` from the session (`tenantFirmId`), never from the client body.

## Roles

| Code | Name |
|---|---|
| `managing_partner` | Managing Partner |
| `senior_associate` | Senior Associate |
| `junior_associate` | Junior Associate |
| `secretary` | Secretary / Paralegal |
| `accounts` | Accounts / Bookkeeper |

## Permission matrix

| Permission | MP | Senior | Junior | Secretary | Accounts |
|---|---|---|---|---|---|
| dashboard.view | ✓ | ✓ | ✓ | ✓ | ✓ |
| clients.view | ✓ | ✓ | ✓ | ✓ | ✓ |
| clients.create | ✓ | ✓ | | ✓ | |
| clients.edit | ✓ | ✓ | | ✓ | |
| clients.delete | ✓ | ✓ | | | |
| matters.view | ✓ | ✓ | ✓ | ✓ | ✓ |
| matters.create | ✓ | ✓ | ✓ | | |
| matters.edit | ✓ | ✓ | ✓ | | |
| matters.delete | ✓ | ✓ | | | |
| matters.view_all | ✓ | ✓ | | | ✓ |
| documents.view | ✓ | ✓ | ✓ | ✓ | |
| documents.manage | ✓ | ✓ | ✓ | ✓ | |
| templates.view | ✓ | ✓ | ✓ | ✓ | |
| templates.manage | ✓ | ✓ | | | |
| calendar.view | ✓ | ✓ | ✓ | ✓ | |
| calendar.manage | ✓ | ✓ | ✓ | ✓ | |
| billing.view | ✓ | ✓ | | | ✓ |
| billing.manage | ✓ | ✓ | | | ✓ |
| trust.view | ✓ | ✓ | | | ✓ |
| trust.manage | ✓ | | | | ✓ |
| intake.view | ✓ | ✓ | ✓ | ✓ | |
| intake.manage | ✓ | ✓ | | ✓ | |
| ai.use | ✓ | ✓ | ✓ | ✓ | |
| ai.manage_settings | ✓ | | | | |
| audit.view | ✓ | ✓ | | | |
| settings.manage | ✓ | | | | |
| users.manage | ✓ | | | | |
| reports.view | ✓ | ✓ | | | ✓ |

Source of truth: `lib/rbac/matrix.ts`.

Phase 3 practice-ops schema and permission usage: `docs/PRACTICE_OPS.md`.

## Matter scoping (`matters.view_all`)

| Role | Matter visibility |
|---|---|
| Managing Partner, Senior Associate, Accounts | All firm matters (`matters.view_all`) |
| Junior Associate, Secretary | Assigned only: responsible lawyer **or** `matter_team` |

Server helpers:

- `canViewAllMatters(session)` in `lib/rbac/permissions.ts`
- `userCanAccessMatter(firmId, matterId, userId, viewAll)` in `lib/repos/matters.ts`
- List filters: `listMatters(..., { viewAll, userId })`

Client registry remains firm-wide for anyone with `clients.view`. Matter lists/counts on a client detail respect assignment for non–`view_all` users.

Templates are firm-wide (permission-gated). Party search and client party lists hide matter-linked rows the user cannot access.

## Phase 1 protected routes

| Area | Routes | Permission(s) | Extra scoping |
|---|---|---|---|
| Clients | `/api/clients*` | `clients.*` | `firm_id` |
| Matters | `/api/matters*` | `matters.*` | `firm_id` + assignment |
| Procedures | `/api/procedures*` | `matters.view` / `matters.edit` | via parent matter |
| Timeline | `/api/matters/[id]/timeline` | `matters.view` / `matters.edit` | via matter |
| Parties | `/api/parties*`, client/matter nested | `matters.*` / `clients.*` | assignment when matter-linked |
| Documents | `/api/documents*`, matter nested | `documents.*` | via matter |
| Templates | `/api/templates*` | `templates.*` | `firm_id` |
| Search | `/api/search` | `clients.view` and/or `matters.view` | matters assigned |
| Dashboard | `/api/dashboard` | `dashboard.view` | assignment |
| Export | `/api/export` | `settings.manage` | whole firm (MP) |
| Audit / staff | `/api/audit`, `/api/staff` | `audit.view` / `users.manage` | `firm_id` |

## UI `<Can>`

Mutating controls on clients, matters, procedures, timeline, parties, documents, and templates are wrapped in `<Can permission="…">`. Route shells use `ProtectedModulePage` / `requireRouteAccess`.

## Audit (critical writes)

| Action | When |
|---|---|
| `clients.create` / `update` / `archive` / `restore` | Client mutations |
| `matters.create` / `update` / `status_change` | Matter mutations |
| `procedures.create` / `update` / `status_change` | Procedure mutations |
| `timeline.create` | Timeline note |
| `parties.create` / `update` / `delete` | Related parties |
| `documents.upload` / `rename` / `delete` / `download` / `generate` | Files |
| `templates.seed_starters` / `update` / `approve` / `download` | Templates |
| `export_created` | Firm export ZIP |

Never put secrets or passwords in audit metadata.

## P1-13 gaps fixed

1. `GET /api/parties` respects assigned-matter scoping (no firm-wide matter title leak for juniors).
2. `POST /api/clients/[id]/parties` checks `userCanAccessMatter` when `matterId` is set.
3. Party PATCH cannot retarget to a matter the user cannot access.
4. Client matter counts (API + SSR) use the same assignment filter as matter lists.
5. Client party lists filter matter-linked parties the user cannot see.
6. Cross-firm IDOR smoke: `npm run smoke:phase1-rbac` (isolation firm vs pilot).

## Server helpers

Import from `lib/rbac/guards.ts` (server only):

| Function | Purpose |
|---|---|
| `requirePermission(code)` | Session + single permission |
| `requireAny(codes)` | Session + any of the codes |
| `requireAll(codes)` | Session + all codes |
| `requireFirmScope(firmId)` | Session + matching `firm.id` |

## Client helpers

| Export | Purpose |
|---|---|
| `AuthProvider` / `useAuth()` | Session + `can` / `canAny` / `canAll` |
| `<Can permission="…">` | Conditional UI |
| `hasPermission(user, code)` | Pure check |

## Seeds and smoke

```bash
npm run db:seed:rbac
DEV_SEED_ENABLED=1 npm run db:seed:dev-users
npm run smoke:phase1-rbac
```

Isolation fixture: firm `isolation-test-firm`, user `isolation@lexzim.local` / `<set-in-env>`. See `docs/DEV_SEEDS.md`.

## Next

**P1-14:** Demo seeds, smoke docs, Phase 2 handoff.
