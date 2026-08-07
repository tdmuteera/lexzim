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
- [x] RBAC matrix includes calendar / billing / trust / intake / reports permission codes (stubs may remain)
- [x] Billing / trust account model decisions recorded before P3 billing prompts (`docs/PRACTICE_OPS.md`: cents + currency; trust ≠ fees)

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

## Suggested first Phase 3 session

1. Re-run `npm run smoke:phase1`, `npm run smoke:phase1-rbac`, `npm run smoke:phase2`
2. Confirm migration `0005_phase3_practice_ops` applied
3. Continue `PHASE 3 - Practice Ops Prompts.md` from **P3-02** (calendar UI)

## Final Phase 2 statement

**PHASE 2 COMPLETE — ready for Phase 3 prompts (Calendar, Billing & Trust, Intake & Conflicts, Reporting)**

## Phase 3 progress

- [x] P3-01 Practice-ops schema
- [ ] P3-02 … P3-14
