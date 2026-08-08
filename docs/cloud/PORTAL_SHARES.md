# Portal shares (P5-04)

**Default: share nothing.** Creating a client, matter, or document does not expose it to the portal.

## Tables

### `matter_portal_shares`

| Column | Meaning |
|--------|---------|
| `firm_id` | Tenant |
| `client_id` | Portal client who may see the matter |
| `matter_id` | Matter (must belong to that client) |
| `permission` | `read` or `read_upload` |
| `revoked_at` | Null = active; set to revoke |

Unique: `(firm_id, matter_id, client_id)`.

### `document_portal_shares`

Same pattern with `document_id` (+ denormalised `matter_id`). Document shares are explicit (matter share alone does not auto-share every file).

## APIs

| Who | Path | Purpose |
|-----|------|---------|
| Staff | `GET/POST /api/portal/shares` | List / create / revoke shares |
| Portal | `GET /api/portal/me/shares` | Active shares for session `firm_id` + `client_id` only |

Portal queries never trust a client-supplied firm id.

## Isolation

Firm A portal users only see rows where `firm_id` matches their portal session. Firm B shares are invisible.

Test: `npm run smoke:portal-shares`

## Revoke

`POST /api/portal/shares` with `{ "revoke": true, "type": "matter"|"document", "shareId": "…" }`.

## Staff UX (P5-06)

Matter detail → **Portal** tab: invite portal user, share/revoke matter and documents, view recent portal activity (`GET /api/portal/activity?matterId=`).

Upload inbox (P5-07): share with `read_upload`, then review `PORTAL_INBOX.md`.

See `CLIENT_PORTAL.md`.
