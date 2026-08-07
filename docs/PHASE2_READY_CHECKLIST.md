# Phase 2 readiness checklist

Phase 1 must be complete before AI/RAG work. Tick when true.

## Phase 1 complete

- [x] Clients / matters / procedures / timeline / parties
- [x] Documents + template merge
- [x] Dashboard + global search
- [x] Firm export / backup docs
- [x] RBAC hardening + cross-firm isolation smoke
- [x] Demo seed + Phase 1 smoke docs
- [x] `/ai` still placeholder (no RAG implementation)

## Platform prerequisites for Phase 2

- [ ] Railway production URL confirmed in `docs/HOSTING.md` / README
- [ ] Supabase Storage bucket `firm-files` healthy in target env
- [x] pgvector (or chosen vector store) available on Supabase for RAG
- [x] Secrets for embedding / LLM providers decided (server `GEMINI_API_KEY`, not committed)

## Product boundaries for Phase 2

Phase 2 **may** add:

- Firm-scoped document indexing / RAG retrieval
- AI chat grounded in firm memory and matter context
- Drafting help that respects template merge fields and practitioner review

Phase 2 **must not**:

- Break `firm_id` isolation or junior assigned-matter rules
- Auto-file without audit
- Replace lawyer review for court-bound documents

## Phase 2 delivery status

Completed via P2-01 to P2-14. See `docs/PHASE2_SMOKE_TEST.md` and `docs/PHASE3_READY_CHECKLIST.md`.

## Final Phase 1 statement

**PHASE 1 COMPLETE — ready for Phase 2 prompts (AI Legal Assistant: RAG, firm memory, drafting help)**

## Final Phase 2 statement

**PHASE 2 COMPLETE — ready for Phase 3 prompts (Calendar, Billing & Trust, Intake & Conflicts, Reporting)**
