# LexZim web phase roadmap status

Status of the hosted LexZim SaaS roadmap (Phases 0 to 5). Desktop / Tauri / SQLite paths are cancelled and out of scope.

**App version:** see `package.json` / Settings → About  
**Last roadmap closeout:** Phase 5 (P5-14)

## Phase summary

| Phase | Theme | Status |
|-------|-------|--------|
| 0 | Foundation (Next.js, Supabase, Railway, tenancy) | COMPLETE |
| 1 | Core LPMS (clients, matters, docs, RBAC, export) | COMPLETE |
| 2 | AI Legal Assistant (RAG, firm memory, grounding) | COMPLETE |
| 3 | Practice ops (calendar, billing, trust, intake, reports) | COMPLETE |
| 4 | Sell & Ship (licences, seats, pilot pack, Railway harden) | COMPLETE |
| 5 | Portal & Scale (limited client portal, privacy, ops) | COMPLETE |

## Phase 5 deliverables (high level)

- Limited client portal (`/portal`): auth, share-nothing default, shared matters/docs, optional inbox
- Staff Portal tab, session admin, AI job queue for embeddings scale
- Multi-firm `/ops`, retention/export/purge, privacy docs, AI conversation minimize
- Ops runbook, backup drill notes, portal auth rate limits, security headers
- Smoke: `docs/PHASE5_SMOKE_TEST.md`, `npm run smoke:phase5`

## Intentionally not built (Phase 5)

- Desktop sync / SQLite / Tauri revival
- Mandatory portal
- Full client AI legal-advice chatbot
- Bank feeds / payment checkout
- Real-time collaborative document editing

## What comes next (post-roadmap)

Iterate on knowledge packs, templates, integrations, and pilot feedback. No further numbered web phase is required for the original 0 to 5 plan.

## Final statements

**PHASE 5 COMPLETE — limited client portal and scale/privacy tooling available**

**LEXZIM WEB PHASE ROADMAP 0–5 COMPLETE — iterate on content, integrations, and pilot feedback next**

## Related

- `docs/PHASE5_READY_CHECKLIST.md`
- `docs/PHASE5_SMOKE_TEST.md`
- `docs/cloud/README.md`
- `docs/ARCHITECTURE_PHASE4.md`
- `CHANGELOG.md`
