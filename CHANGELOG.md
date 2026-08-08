# Changelog

All notable changes to LexZim are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.0] - 2026-08-09

Phase 5 Portal & Scale **COMPLETE**. Web phase roadmap 0 to 5 complete.

### Added
- Phase 5 ADR and portal threat model (`docs/cloud/`)
- Client portal route skeleton at `/portal` + `/api/portal/health`
- Portal auth: `portal_users` / magic links, cookie sessions separate from staff (`docs/cloud/PORTAL_AUTH.md`)
- Portal share tables (`matter_portal_shares`, `document_portal_shares`) with share-nothing default + isolation smoke
- Limited client portal UI: shared matters/status/hearing, document download, disclaimers (`docs/cloud/CLIENT_PORTAL.md`)
- Staff Portal tab on matters: invite, share/revoke matter and documents, activity feed
- Portal upload inbox (quarantine): client upload with size limits, staff accept/dismiss, in-app alerts (`docs/cloud/PORTAL_INBOX.md`)
- Staff session admin: list/revoke web sessions, deactivate/reactivate users with seat checks (`docs/cloud/SESSION_ADMIN.md`)
- AI job queue for KB/firm memory reindex + optional worker (`docs/cloud/EMBEDDINGS_SCALE.md`, `npm run jobs:ai`)
- Platform ops console at `/ops`: list/suspend firms, issue licences, aggregate health (`docs/cloud/ADMIN.md`)
- Privacy offboarding: firm export v3 (portal tables), MP suspend with typed slug, ops hard purge, portal “my data” JSON (`docs/cloud/RETENTION.md`)
- Privacy template + processing register; AI conversation retention purge (90-day default) (`docs/cloud/PRIVACY.md`)
- Ops hardening: `docs/cloud/OPS_RUNBOOK.md`, portal auth rate limit (20/IP/15m), baseline security headers
- Phase 5 smoke + roadmap status (`docs/PHASE5_SMOKE_TEST.md`, `docs/ROADMAP_STATUS.md`, `npm run smoke:phase5`)

## [0.4.0] - 2026-08-08

Phase 4 Sell & Ship **COMPLETE**.

### Added
- Production AI providers: Claude and OpenAI alongside Gemini (BYO or managed keys)
- AI routing, soft monthly budgets, safety defaults (web lookup off, disclaimer always on)
- SaaS firm licensing (`trial` / `solo` / `firm`) with expiry policy that never blocks export
- Edition feature flags, seat limits, trial matter cap, staff invite
- Optional LexZim AI proxy (Firm edition) with licence tokens and quotas
- Settings → About: app version, edition, licence, knowledge pack version
- SemVer single source (`package.json` / `lib/release/version.ts`), releasing runbook
- Railway hardening: Node 20, health/restart, redacted logs (`docs/RAILWAY.md`)
- Production secrets + domain/SSL/cookie notes (`docs/PRODUCTION_SECRETS.md`)
- Pilot onboarding checklist (dismissible), Firm profile settings (`docs/ONBOARDING.md`)
- End-user documentation pack in `docs/user/` with in-app Help readers (`/help/[slug]`)
- Sales pack: pricing draft, one-pager, pilot offer (`docs/sales/`)
- Ops pack: pilot runbook, support triage, issue template (`docs/ops/`)
- Safe diagnostics download (Settings → About; no matter contents, no auto-upload)
- Phase 4 release smoke (`npm run smoke:phase4`, `docs/PHASE4_SMOKE_TEST.md`)
- Phase 4 architecture and Phase 5 readiness checklist

### Changed
- Production readiness audit fixes from P4-01 (invoice list, calendar ACL, health, export coverage)

## [0.3.0] - 2026-08

Phase 3 Practice Ops.

### Added
- Calendar, deadlines, reminders
- Time entries → fee invoices → fee payments
- Trust ledger (separate from fees)
- Intake, conflict search, conversion
- Reports + CSV
- Role-aware dashboard money widgets

## [0.2.0] - 2026-08

Phase 2 AI Assistant.

### Added
- Zimbabwe knowledge pack + embeddings (pgvector)
- Legal research RAG, Matter Assist, drafting polish
- AI settings and usage audit

## [0.1.0] - 2026-07

Phase 0 to 1 foundation.

### Added
- Next.js App Router SaaS on Railway + Supabase
- Multi-tenant firms, RBAC, clients, matters, documents, templates
- Firm export / backup snapshot
