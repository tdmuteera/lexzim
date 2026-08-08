# LexZim platform ops / super-admin (P5-10)

Operator tools for LexZim staff (not firm lawyers). Same Next.js app under `/ops` and `/api/platform/*`.

## Principles

1. **No matter contents by default.** Ops APIs return firm metadata, seat/licence aggregates, and env readiness only.
2. **Strong auth:** caller must be an active row in `platform_admins` (Supabase auth user id).
3. **Optional IP allowlist:** set `OPS_IP_ALLOWLIST` (comma-separated exact IPs) in production.
4. Soft-disable firms with `status = suspended` (login blocked). Hard purge is ops-only (typed `DELETE FIRM`).

## Hard purge

1. Suspend or archive the firm.
2. Ensure a firm export exists if the client needs a copy.
3. `/ops` → Hard purge: select firm, confirm slug, phrase `DELETE FIRM`.
4. API: `DELETE /api/platform/firms` with `{ firmId, confirmSlug, confirmPhrase: "DELETE FIRM" }`.

Removes Storage under `firms/{id}/`, staff Supabase Auth users, and the firm row (cascade). Provider PITR may retain longer.

## Become a platform admin

1. Create or use an existing Supabase Auth user (email/password).
2. Seed:

```bash
npx tsx scripts/seed-platform-admin.ts --email=ops@example.com --name="Ops Admin"
```

3. Sign in at `/login` with that account, then open `/ops`.
4. If the account is also a firm user on a suspended firm, firm session load fails; prefer a dedicated ops auth user that is only in `platform_admins`.

## Environment

| Var | Purpose |
|-----|---------|
| `OPS_IP_ALLOWLIST` | Optional. When set, only listed client IPs (from `x-forwarded-for` / `x-real-ip`) may call ops APIs. Empty = no IP gate (dev). |

## UI

| Path | Purpose |
|------|---------|
| `/ops` | Console: health, firm list, suspend/restore, issue licence |

## APIs

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/platform/firms` | List firms + licence + active user counts |
| PATCH | `/api/platform/firms` | `{ firmId, status }` soft disable/restore |
| POST | `/api/platform/firms` | Create firm tenant (optional) |
| GET/POST | `/api/platform/licences` | Read / issue / revoke licence |
| GET | `/api/platform/health` | Aggregate health (no matter data) |

All require `requireOpsAccess` (platform admin + IP allowlist).

## Firm disable

- `PATCH` status `suspended` or `archived` blocks firm staff login (`loadSessionUser` returns null).
- Data remains until privacy delete (P5-11).
- Restore with `status: active` (or `trial` / `demo` as appropriate).

## Separate ops app?

Not required for MVP. Same Railway service is fine with IP allowlist + platform_admins. Split later if threat model or staffing needs a separate hostname.

## Related

- `docs/LICENSING.md`, `docs/TENANT_ARCHITECTURE.md`, `docs/AUTH.md`
- CLI: `npm run licence:issue`
