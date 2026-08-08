# LexZim cloud / portal docs (Phase 5)

| Doc | Purpose |
|-----|---------|
| `ADR_PHASE5.md` | Architecture decision: portal on same Next.js app, share-nothing, scale path |
| `THREAT_MODEL.md` | Portal and tenancy threats + mitigations |
| `DEV_SETUP_PORTAL.md` | Local `/portal` skeleton setup (P5-02) |
| `PORTAL_AUTH.md` | Portal password + magic link auth (P5-03) |
| `PORTAL_SHARES.md` | Share-nothing model + isolation (P5-04) |
| `CLIENT_PORTAL.md` | Limited client UI (P5-05) + staff Portal tab (P5-06) |
| `PORTAL_INBOX.md` | Optional client upload quarantine inbox (P5-07) |
| `SESSION_ADMIN.md` | Staff web session list/revoke + deactivate (P5-08) |
| `EMBEDDINGS_SCALE.md` | KB/firm reindex job queue + worker (P5-09) |
| `ADMIN.md` | Multi-firm super-admin /ops (P5-10) |
| `RETENTION.md` | Draft retention / offboarding windows (P5-11) |
| `PRIVACY.md` | Privacy notice template for legal review (P5-12) |
| `PROCESSING_REGISTER.md` | Lightweight processing activities register (P5-12) |
| `OPS_RUNBOOK.md` | Staging/prod, rollback, backup drill, rate limits, headers, free-tier exit (P5-13) |

Staff SaaS hosting remains documented in `docs/HOSTING.md`, `docs/RAILWAY.md`, and `docs/ARCHITECTURE_PHASE4.md`.

Phase 5 smoke: `docs/PHASE5_SMOKE_TEST.md` (`npm run smoke:phase5`). Roadmap: `docs/ROADMAP_STATUS.md`.
