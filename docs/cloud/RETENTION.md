# Retention windows (draft for legal review) — P5-11 / P5-12

Placeholders only. Not legal advice. Align with Zimbabwe Cyber and Data Protection Act mindset (`PRIVACY.md`, `PROCESSING_REGISTER.md`).

Desktop / local wipe: **N/A** (LexZim is hosted SaaS; no desktop sync product).

| Data | Draft window | Notes |
|------|--------------|--------|
| Firm export ZIP | Client custody | LexZim does not keep a copy of the downloaded ZIP |
| Soft-suspend (`status=suspended`) | Until restore or purge | Staff login blocked; data retained |
| Hard purge (ops) | Immediate app + Storage under `firms/{id}/` | Provider backups / PITR may retain longer per hoster plan |
| Portal magic links | Link TTL (see `PORTAL_AUTH.md`) | Token hashes only; unused expire |
| Portal sessions | Cookie TTL (~8h) | Separate from staff auth |
| Staff sessions registry | Until revoke / user deactivate / firm purge | See `SESSION_ADMIN.md` |
| Audit logs | With firm (cascade on purge) | Ops purge writes a final `platform.firm_purged` row without firm_id |
| AI conversations / messages | **Default 90 days** from last update | Purge via Settings → AI or `npm run privacy:purge-ai`; override `AI_CONVERSATION_RETENTION_DAYS` or firm setting `ai_conversation_retention_days` (7–3650) |
| AI embeddings / KB | Until re-index or firm purge | System KB re-ingest from Settings; not deleted by conversation purge |
| Portal “my data” export | Client custody | Portal-held profile/shares/inbox metadata only |

## Offboarding checklist (firm)

1. Download firm export (Settings → Backup) — archive version 3 includes portal tables.
2. Optionally purge old AI conversations (Settings → AI).
3. Suspend firm (Settings typed slug, or Ops suspend).
4. Optional: Ops hard purge with slug + `DELETE FIRM` after legal approval.

## Related

- `PRIVACY.md`, `PROCESSING_REGISTER.md`, `BACKUP.md`, `ADMIN.md`, `CLIENT_PORTAL.md`, `docs/AI.md`
