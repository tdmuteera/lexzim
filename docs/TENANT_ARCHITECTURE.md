# LexZim tenant architecture (LPMS Core)

LexZim is the **product name**. **LPMS Core** is the strategic name for the same multi-tenant legal practice platform: one hosted system, many independent firm workspaces.

## Model

```
LexZim / LPMS Core (one platform)
├── Firm tenant A (e.g. T Pfigu Attorneys) — pilot customer #1
├── Firm tenant B (e.g. XYZ Legal)
└── Demo tenant (marketing / demos — not a separate app)
```

Each firm tenant has:

- Its own users, clients (Phase 1+), matters, documents, billing, settings
- Its own branding display name (logo URL later; theme pack defaults from TPfigu pilot CSS)
- Complete data isolation via **`firm_id`** on every firm-scoped row

The pilot firm **T Pfigu Attorneys** is tenant #1, not a bespoke single-firm codebase.

## Two operator planes

| Plane | Who | Purpose |
|---|---|---|
| **Firm workspace** | Managing Partner, lawyers, staff | Day-to-day practice (RBAC via `roles` / `permissions`) |
| **Platform admin** | LexZim / LPMS owner | Register firms, trials, demos, future subscriptions (`platform_admins` table) |

Firm RBAC roles are **not** platform roles. Platform admins use `requirePlatformAdmin()`, not `managing_partner`.

## Bootstrap vs growth

| State | Behavior |
|---|---|
| **Empty database** | `authNeedsSetup()` → first-run wizard creates **tenant #1** + Managing Partner |
| **Platform already has firms** | First-run wizard disabled; new firms via `platformCreateFirm()` (admin only, UI later) |
| **Demo tenant** | Another row in `firms` with `is_demo = true`; seed script `npm run db:seed:demo-firm` (dev guard) |

## Tenant isolation rules

1. Every firm-scoped table includes `firm_id`.
2. Every query filters `WHERE firm_id = session.firm.id` (use `tenantFirmId(session)`).
3. Never trust client-supplied `firm_id` without `requireFirmScope()`.
4. App-layer isolation now; Postgres **RLS** before multi-customer production launch (Phase 5 hardening).

## Storage layout (Phase 1+)

Supabase Storage paths:

```text
firms/{firm_id}/documents/...
firms/{firm_id}/templates/...
```

Helper: `firmStoragePrefix(firmId)` in `lib/tenant/scope.ts`.

## Dynamic branding

- **Platform name:** LexZim (login chrome, product references)
- **Tenant name:** `session.firm.name` in sidebar, welcome lines, exports
- **Default theme:** TPfigu cream/gold CSS (pilot look); per-firm colors later via `firm_settings`

`getFirmBranding(session)` in `lib/firm/branding.ts`.

## Code map

| Path | Role |
|---|---|
| `lib/db/schema.ts` | `firms`, `platform_admins`, `users.firm_id` |
| `lib/tenant/scope.ts` | `tenantFirmId`, storage prefix |
| `lib/firm/branding.ts` | Tenant display branding |
| `lib/platform/admin.ts` | `requirePlatformAdmin` |
| `lib/platform/firms.ts` | `platformCreateFirm` |
| `lib/rbac/guards.ts` | `requireFirmScope`, permissions |
| `GET /api/platform/firms` | Platform admin tenant list (stub API) |

## Deferred (not Phase 0)

- Platform owner dashboard UI
- Subscriptions, trials billing, feature limits
- Client portal role (external clients)
- Per-firm custom color themes
- RLS policies (documented for Phase 5)

## Related docs

- `docs/RBAC.md` — firm-level permissions
- `docs/AUTH.md` — login and bootstrap
- `docs/DATABASE.md` — schema and migrations
- `../PROMPTS/LPMS Core - Multi-Tenant Platform Vision.md` — strategic overview
