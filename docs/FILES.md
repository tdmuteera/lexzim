# Firm files (P1-07)

Matter documents stored in **Supabase Storage**, namespaced by firm.

## Path convention

```text
firms/{firm_id}/matters/{matter_id}/documents/{document_id}/{file_name}
```

Templates (P1-08+) use:

```text
firms/{firm_id}/templates/...
```

Helper: `firmStoragePrefix(firmId)` in `lib/tenant/scope.ts`.  
Builder: `matterDocumentStoragePath()` in `lib/storage/firm-files.ts`.

## Bucket

| Setting | Value |
|---|---|
| Name | `firm-files` (override with `SUPABASE_STORAGE_BUCKET`) |
| Public | **No** |
| Max size | 25 MB |
| Allowed MIME | PDF, DOC, DOCX, JPEG/PNG/GIF/WebP, plain text |

The app creates the bucket on first upload if missing (service role).

## Access model (app-enforced)

LexZim does **not** rely on Storage RLS for multi-tenant isolation. Migration `0058` keeps `firm-files` private and removes broad `storage.objects` policies so JWT roles cannot list or download firm files except through LexZim signed URLs.

1. User authenticates via Supabase Auth cookies.
2. API routes require `documents.view` / `documents.manage`.
3. Matter access uses P1-03 rules (`matters.view_all` vs assigned).
4. Server uses the **service role** only after those checks.
5. Every storage path is asserted to start with `firms/{session.firm.id}/`.

### Recommended future Storage policies

When tightening later, prefer policies that parse the first path segment:

- Authenticated users may only read/write objects under `firms/{their_firm_id}/…`
- Prefer keeping uploads through the API so metadata (`documents` table) stays consistent

Until then: **never expose the service role to the browser**.

## API

| Method | Path | Permission |
|---|---|---|
| `GET` | `/api/matters/[id]/documents` | `documents.view` |
| `POST` | `/api/matters/[id]/documents` (multipart `file`, optional `title`) | `documents.manage` |
| `GET` | `/api/documents/[id]` | `documents.view` |
| `PATCH` | `/api/documents/[id]` `{ title }` | `documents.manage` |
| `DELETE` | `/api/documents/[id]` | `documents.manage` |
| `GET` | `/api/documents/[id]/download` | `documents.view` (signed URL) |

## Timeline + audit

- Upload/delete → timeline `eventType: document`
- Audit: `documents.upload`, `documents.rename`, `documents.delete`, `documents.download`

## Manual bucket setup (optional)

Supabase Dashboard → Storage → New bucket:

1. Name: `firm-files`
2. Public: off
3. File size limit: 26214400
4. Allowed MIME types: as above

## Env

```bash
SUPABASE_STORAGE_BUCKET=firm-files   # optional
SUPABASE_SERVICE_ROLE_KEY=...        # required for upload/signed URLs
```

## Next

**P1-08:** Template library stored under the same firm prefix.
