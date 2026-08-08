# Portal upload inbox (P5-07)

Optional narrow client upload path. Files are **not** published as matter documents until staff accept them.

## Behaviour

1. Staff share a matter with permission `read_upload` (Portal tab checkbox: “Allow client uploads to inbox”).
2. Client uploads from `/portal/home` (PDF / Word / images / text, max **25 MB**, same allowlist as staff uploads).
3. File lands in `portal_inbox_uploads` under `firms/{firmId}/matters/{matterId}/portal-inbox/…`.
4. Staff see pending items on the matter **Portal** tab; **Accept** creates a matter document (`docType: portal_accepted`); **Dismiss** closes the item.
5. Staff get an in-app alert (`staff_notifications`) in the topbar bell.

## Virus scanning

**Not implemented.** Treat every portal upload as untrusted. Open only after staff review. Future option: ClamAV or vendor scan before accept. Documented for legal/ops review.

## APIs

| Who | Path | Purpose |
|-----|------|---------|
| Portal | `POST /api/portal/matters/[matterId]/inbox` | Multipart upload (requires `read_upload` share) |
| Staff | `GET /api/portal/inbox?matterId=` | List inbox (optional `status=pending`) |
| Staff | `POST /api/portal/inbox` | `{ uploadId, action: "accept"\|"dismiss" }` |
| Staff | `GET/POST /api/notifications` | In-app alerts |

## Audit

- `portal.inbox_upload`
- `portal.inbox_accepted`
- `portal.inbox_dismissed`

## Related

- `PORTAL_SHARES.md`, `CLIENT_PORTAL.md`, `THREAT_MODEL.md` (T6)
