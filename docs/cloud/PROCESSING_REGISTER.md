# Processing register (lightweight) — P5-12

**Status:** Internal ops register draft for legal review. Not exhaustive. Update when processing changes.

Controller/processor split: see `PRIVACY.md`. Rows marked **Firm controller** are processed by LexZim as processor on Firm instructions unless otherwise stated.

| # | Activity | Data categories | Data subjects | Purpose | Systems | Retention cue | Access |
|---|----------|-----------------|---------------|---------|---------|---------------|--------|
| 1 | Staff account admin | Identity, role, login | Firm staff | Access control | Supabase Auth, `users`, `staff_sessions` | Until deactivate / firm purge | `users.manage` / ops |
| 2 | Matter & client CRM | Identity, contact, matter facts | Clients, opposing parties, staff | Case management | Postgres firm tables | Firm policy; purge with firm | RBAC matter ACLs |
| 3 | Document storage | Files, metadata | Clients / matters | File holding | Supabase Storage `firms/{id}/` | With matter / firm purge | `documents.*` |
| 4 | Billing & trust | Fee invoices, trust ledger | Clients | Accounting (separated) | Billing/trust tables | Firm policy; purge with firm | billing/trust perms |
| 5 | Calendar & deadlines | Dates, matter links | Staff / clients (indirect) | Diary | Calendar/deadline tables | Firm policy | calendar perms |
| 6 | Client portal auth | Email, name, session | Portal users | Limited client access | `portal_users`, cookie | Active account; magic link TTL | Portal session |
| 7 | Portal shares | Share grants, downloads | Portal users | Explicit sharing | Share tables, audit | Until revoke / firm purge | Staff portal tab |
| 8 | Portal inbox | Upload metadata, files | Portal users | Quarantine intake | `portal_inbox_uploads`, Storage | Until accept/dismiss / purge | Staff review |
| 9 | AI chat | Prompts, answers, citations meta | Staff (may include matter text) | Research / assist | `ai_conversations`, `ai_messages`, providers | **Minimize** (default 90 days purge) | `ai.use` |
| 10 | AI embeddings | Chunk text, vectors | Public law KB + firm snippets | RAG | `ai_embeddings`, KB tables | Re-index / firm purge | `ai.manage_settings` |
| 11 | AI usage metering | Counts, mode, provider | Firm (aggregate) | Budget / licence | `ai_usage_events` | Firm purge | MP settings |
| 12 | Firm export | Snapshot of firm JSON + storage keys | Firm / clients | Portability / offboarding | `/api/export` ZIP | Client custody of ZIP | `settings.manage` |
| 13 | Portal self-export | Portal profile, shares, inbox meta | Portal user | Access / transparency | `/api/portal/me/export` | Client custody of JSON | Portal session |
| 14 | Ops admin | Firm status, licences, health aggregates | Firms (not matter contents) | Platform operations | `/ops`, `/api/platform/*` | Ops policy | `platform_admins` + IP allowlist |
| 15 | Audit logging | Action, actor, metadata | Staff / portal | Security & compliance | `audit_logs` | Cascade on firm purge; purge breadcrumb without firm_id | `audit.view` / ops |
| 16 | Hosting & backups | Full DB/Storage snapshots | All of above | Resilience | Supabase PITR, Railway | Provider plan windows | Platform ops |

## AI conversation minimize (implemented)

- Default retention: **90 days** from conversation `updated_at` (env `AI_CONVERSATION_RETENTION_DAYS`, or firm setting `ai_conversation_retention_days`).
- Purge: deletes old `ai_conversations` (messages cascade). Does **not** delete system KB embeddings.
- Run: Settings → AI → Purge old conversations, or `npm run privacy:purge-ai`, or cron the same script.

## Legal review checklist

- [ ] Confirm controller/processor roles and DPA with each Firm
- [ ] Confirm subprocessors + regions (Supabase, Railway, AI vendors)
- [ ] Confirm retention windows against CDPA / engagement letters
- [ ] Confirm portal vs firm DSR handling language
- [ ] Publish client-facing notice derived from `PRIVACY.md` (remove placeholders)

## Related

- `PRIVACY.md`, `RETENTION.md`, `THREAT_MODEL.md`, `docs/AI.md`
