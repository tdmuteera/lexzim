# Staff session admin (P5-08)

Web session and user admin for Managing Partners (`users.manage`). Replaces the old desktop “device pairing” idea.

## What you can do

On **Lawyers & Staff** (`/staff`):

1. List firm users and seat usage (Phase 4 licence seats)
2. Create users (seat-gated) and tick the modules they may use
3. **Deactivate** / **Reactivate** users (cannot deactivate yourself; reactivate re-checks seats)
4. List **active web sessions** (registered on login)
5. **Revoke** one session or all sessions for a user

## How sessions work

- Staff auth remains **Supabase Auth** cookies (no desktop sync).
- On login, LexZim records a row in `staff_sessions` using the JWT `session_id` when present.
- Revoke marks the registry row and best-effort deletes `auth.sessions` (when the DB role can reach the `auth` schema).
- Subsequent requests that see a revoked `session_id` sign the browser out.

Access tokens may remain valid until expiry after revoke; refresh/session rows are cleared when possible. Prefer short JWT lifetimes in Supabase Auth settings for production.

## Deactivate

- Sets `users.is_active = false`
- Revokes tracked sessions
- Best-effort Supabase ban so new sign-ins fail

Reactivate clears the ban (best-effort) and requires an available seat.

## APIs

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/staff` | Users + seats |
| POST | `/api/staff` | Invite |
| GET | `/api/staff/sessions` | Active sessions |
| POST | `/api/staff/sessions` | `revoke` / `revoke_all` / `deactivate` / `reactivate` |

## Audit

- `users.create`
- `users.access_update`
- `users.deactivate` / `users.reactivate`
- `users.session_revoke` / `users.session_revoke_all`
- `auth.login` / `auth.logout` (existing)

## Related

- `docs/AUTH.md`, Phase 4 licensing / seats
- Portal sessions remain separate (`lz_portal_session`; see `PORTAL_AUTH.md`)
