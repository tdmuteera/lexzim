# Phase 3 readiness checklist

Phase 2 (AI Legal Assistant) must be complete before Calendar / Billing / Intake / Reporting work. Tick when true.

## Phase 2 complete

- [x] AI schema + Gemini provider (Flash + embeddings)
- [x] Zimbabwe starter KB ingest + pgvector embeddings
- [x] RAG retrieve + grounded / not-found answers
- [x] Firm memory index + RBAC-scoped retrieve
- [x] Legal Research + Matter Assist UI
- [x] Draft-from-template (merge → optional AI polish → save)
- [x] Connectivity / error UX (honest banners, retries)
- [x] Optional allowlisted web lookup (default OFF, UNVERIFIED)
- [x] Phase 2 smoke (`npm run smoke:phase2`) + docs

## Platform prerequisites for Phase 3

- [ ] Railway production URL confirmed in `docs/HOSTING.md` / README (if not already)
- [x] Supabase Postgres + Storage healthy for pilot firm
- [x] RBAC matrix includes calendar / billing / trust / intake / reports permission codes
- [x] Billing / trust account model decisions recorded (`docs/PRACTICE_OPS.md`: cents + currency; trust ≠ fees)

## Product boundaries for Phase 3

Phase 3 **may** add:

- Calendar and hearing/diary workflows
- Billing and trust accounting (with strict controls)
- Intake and conflict checks
- Management reporting packs

Phase 3 **must not**:

- Weaken `firm_id` isolation or assigned-matter RBAC
- Auto-send trust disbursements without controls/audit
- Replace Phase 2 AI grounding rules (no invented authorities)
- Add payment gateways or bank feeds (out of scope)

## Phase 3 progress

- [x] P3-01 Practice-ops schema
- [x] P3-02 Calendar UI
- [x] P3-03 Deadline templates
- [x] P3-04 Reminders
- [x] P3-05 Time tracking
- [x] P3-06 Disbursements
- [x] P3-07 Invoices / fee payments
- [x] P3-08 Trust
- [x] P3-09 Intake forms
- [x] P3-10 Conflict search
- [x] P3-11 Conversion
- [x] P3-12 Reports
- [x] P3-13 Dashboard + money RBAC
- [x] P3-14 Seeds, smoke, Phase 4 handoff

## Final Phase 3 statement

**PHASE 3 COMPLETE — ready for Phase 4 prompts (Sell & Ship: production AI, licensing, onboarding, pilots on Railway)**

Continue with `docs/PHASE4_READY_CHECKLIST.md` and `PHASE 4 - Sell & Ship Prompts.md`.
