# Backup & export (P1-12)

## Firm export (in-app)

Managing Partners with `settings.manage` use **Settings → Backup & Export**.

- **API**
  - `GET /api/export`: last export timestamp + warnings
  - `POST /api/export`: builds a ZIP archive and records audit `export_created`
- **Last export** stored in `firm_settings` key `last_export_at`
- **Archive contents**
  - `manifest.json` (format version **3**, firm metadata, counts, exclusions)
  - `data/*.json` for core entities: firm, clients, matters, team, parties, procedures, events, documents, templates, versions, users (profile fields only), firm_settings
  - Phase 3 practice-ops: calendar_events, deadline_templates, matter_deadlines, time_entries, disbursements, invoices, invoice_lines, fee_payments, trust_accounts, trust_ledger_entries, intakes, conflict_checks
  - Phase 5 portal: portal_users (no password hashes), matter_portal_shares, document_portal_shares, portal_inbox_uploads
  - `data/storage_keys.json`: Supabase Storage object keys under `firms/{firm_id}/…` (includes portal inbox paths)
- **Not included**
  - API keys / secrets / tokens / password-like settings
  - Auth passwords or refresh tokens
  - Binary file blobs (paths only in MVP)
  - AI embeddings / knowledge chunks (re-ingest from Settings)
  - Portal password hashes / magic-link token hashes

Fee payments and trust ledger are both exported but must stay separate on restore.

Offboarding: export → suspend (Settings typed slug) → optional ops hard purge. See `docs/cloud/RETENTION.md`. Desktop wipe N/A.

## Platform backups (ops)

Separate from firm self-service export:

| Layer | What | Notes |
|---|---|---|
| Supabase Postgres | Point-in-time recovery (PITR) and daily backups (plan-dependent) | Restore is platform ops, not end-user |
| Supabase Storage | Bucket retention / backups per project settings | Firm files live under `firms/{firm_id}/` |
| Railway | App redeploys from git; not a data backup | Redeploy does not restore Postgres |

Document project-specific PITR windows and who can trigger restores in your ops runbook.

## Restore drill (P5-13)

Quarterly platform drill (prefer staging or a disposable clone): confirm backups/PITR, restore, verify `/api/health` + one staff login + one portal login (if enabled) + firm export. Full steps and owners: `docs/cloud/OPS_RUNBOOK.md`.

## Restore (MVP honesty)

There is **no** one-click import wizard in Phase 1.

To restore into a fresh firm:

1. Create the new firm / users via normal setup (or support).
2. Use the JSON dumps as a source of truth for support-assisted migration.
3. Re-upload or copy Storage objects listed in `storage_keys.json` into the new firm prefix.
4. Re-map user IDs / role IDs carefully; auth users are not recreated by the ZIP alone.

Future phases may add guided import. Until then, treat restore as support-assisted.

## Audit

Successful downloads write `export_created` with filename, counts, and storage key count. Never put secrets in audit metadata.

## Related

- `docs/cloud/OPS_RUNBOOK.md` (platform backup drill, Railway rollback)
- `docs/cloud/RETENTION.md` (offboarding export / purge)
