# Client portal (P5-05 / P5-06 / P5-07)

Limited read access for invited clients on the hosted LexZim web app.

## What clients can do

1. Sign in at `/portal/login` (password or magic link; see `PORTAL_AUTH.md`)
2. Open `/portal/home` to see **only** actively shared matters and documents
3. View high-level matter status, area of law, reference, and next hearing (if set)
4. Download shared documents via short-lived signed URLs
5. When the firm enables uploads (`read_upload`), send a file to the firm inbox (quarantine until staff accept)

## What is intentionally missing

- AI legal advice / research
- Trust ledgers and fee invoices
- Internal timelines, procedures, lawyer notes (by default)
- Automatic visibility of all firm files (share-nothing default)

## Routes

| Path | Audience |
|------|----------|
| `/portal` | Landing / about |
| `/portal/login` | Client sign-in |
| `/portal/home` | Shared workspace |
| `/api/portal/me/shares` | Shared matters + documents JSON |
| `/api/portal/documents/[id]/download` | Portal download (share-gated) |
| `/api/portal/matters/[matterId]/inbox` | Portal upload to quarantine inbox |

## Staff side (P5-06 / P5-07)

On a matter, open the **Portal** tab:

1. Invite a portal user for the matter’s client (password and/or magic link)
2. Share the matter to the portal; optionally enable **upload inbox**
3. Share individual documents explicitly (matter share does not auto-share files)
4. Revoke matter or document shares
5. Accept or dismiss pending portal uploads
6. Review recent portal activity for that matter

APIs used by the panel:

- `POST /api/portal/invites`
- `GET` / `POST /api/portal/shares` (see `PORTAL_SHARES.md`)
- `GET` / `POST /api/portal/inbox` (see `PORTAL_INBOX.md`)
- `GET /api/portal/activity?matterId=`

## Disclaimers (shown in UI)

Portal copy states that the portal is not legal advice, has no AI assistant, and does not show trust money. Clients should contact their firm for matter questions.

## Security notes

- Portal session cookie is separate from staff auth
- Downloads require an active `document_portal_shares` row for the session `firm_id` + `client_id`
- Uploads require matter share permission `read_upload` and stay quarantined until accept
- No automated virus scan yet (see `PORTAL_INBOX.md`)
- Signed download links default to 15 minutes (max 1 hour)

## Related

- `ADR_PHASE5.md`, `THREAT_MODEL.md`
- `PORTAL_AUTH.md`, `PORTAL_SHARES.md`, `PORTAL_INBOX.md`
- `DEV_SETUP_PORTAL.md`
