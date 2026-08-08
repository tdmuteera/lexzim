# Phase 5 readiness checklist

Phase 4 (Sell & Ship) is complete. Phase 5 adds optional portal, privacy tooling, and scale work.

## Phase 4 complete

- [x] Production AI providers + routing/budgets/safety defaults
- [x] Firm licensing, editions, seats; export never hostage
- [x] Railway hardening, secrets/domain notes, About/version
- [x] Pilot onboarding + Help + sales + ops packs
- [x] Diagnostics download (no matter contents)
- [x] `docs/PHASE4_SMOKE_TEST.md` + `npm run smoke:phase4`
- [x] `docs/ARCHITECTURE_PHASE4.md`
- [ ] Railway production/staging URL recorded in `docs/HOSTING.md` (ops confirms when live)

## Phase 5 progress

- [x] P5-01 ADR + threat model (`docs/cloud/ADR_PHASE5.md`, `THREAT_MODEL.md`)
- [x] P5-02 Portal skeleton (`/portal`, `/api/portal/health`, `DEV_SETUP_PORTAL.md`)
- [x] P5-03 Portal auth (`portal_users`, password + magic link, `PORTAL_AUTH.md`)
- [x] P5-04 Portal shares schema + isolation smoke (`PORTAL_SHARES.md`)
- [x] P5-05 Limited client portal UI (`CLIENT_PORTAL.md`)
- [x] P5-06 Staff share / invite / revoke / activity UX (matter Portal tab)
- [x] P5-07 Portal upload inbox + staff alerts (`PORTAL_INBOX.md`)
- [x] P5-08 Staff session admin + deactivate (`SESSION_ADMIN.md`)
- [x] P5-09 Embeddings scale jobs + worker notes (`EMBEDDINGS_SCALE.md`)
- [x] P5-10 Multi-firm super-admin `/ops` (`ADMIN.md`)
- [x] P5-11 Privacy export / deactivate / purge + portal my-data (`RETENTION.md`)
- [x] P5-12 Privacy docs + AI conversation minimize (`PRIVACY.md`, `PROCESSING_REGISTER.md`)
- [x] P5-13 Ops hardening: `OPS_RUNBOOK.md`, portal auth rate limit, security headers, backup drill
- [x] P5-14 E2E smoke + roadmap closeout (`PHASE5_SMOKE_TEST.md`, `ROADMAP_STATUS.md`, `npm run smoke:phase5`)

## Platform prerequisites for Phase 5

- [ ] Stable pilot on Railway with known HTTPS URL (preferred before production portal)
- [x] Export + restore support path understood for portal-era data (`BACKUP.md` + `OPS_RUNBOOK.md` drill)
- [ ] Privacy / retention policy draft owners named **[TBD]**
- [x] Scale tier decision table documented (`OPS_RUNBOOK.md`; budget owners still **[TBD]**)

## Product boundaries for Phase 5

Phase 5 **may** add:

- **Client portal** (authenticated clients viewing limited shared matter/docs)
- **Privacy tooling** (retention, deletion workflows, DSR-style exports beyond firm archive)
- **Scale tiers** (paid hosting assumptions, connection pooling, rate limits, multi-region notes)

Phase 5 **must not**:

- Weaken `firm_id` isolation or mix trust with fees
- Skip conflict gates
- Ship provider keys to the browser
- Block export on licence expiry
- Reintroduce desktop installers or desktop sync
- Auto-share matters to the portal (share-nothing default)

## Suggested next session

Iterate on content, integrations, and pilot feedback. See `docs/ROADMAP_STATUS.md`.

## Final statements

**PHASE 5 COMPLETE — limited client portal and scale/privacy tooling available**

**LEXZIM WEB PHASE ROADMAP 0–5 COMPLETE — iterate on content, integrations, and pilot feedback next**

## Final Phase 4 statement (historical)

**PHASE 4 COMPLETE — ready for Phase 5 prompts (Client Portal, privacy tooling, scale beyond free tiers)**
