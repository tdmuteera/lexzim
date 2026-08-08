# RELEASE_AUDIT_P4 — LexZim Phase 4 gate

Date: 2026-08-07  
Scope: P4-01 production-readiness audit  
Status: P0 none confirmed; critical P1s addressed in this gate (see below)  
Gate: no installer work / no pilot invites until P0s cleared and critical P1s shipped

## Verdict

No confirmed cross-firm `firm_id` IDOR or trust/fee mixing ship-blockers. Auth/RBAC on money and AI matter routes is sound. Critical P1s fixed in P4-01 (invoice list performance, calendar matter ACL, health readiness, invoice number allocation, Phase 3 export coverage, seed exit hang). Railway production URL remains an **ops** P1 until recorded.

## P0 (ship blockers)

None confirmed in code review.

## P1 (critical) — fixed in P4-01

| ID | Issue | Resolution |
|---|---|---|
| P1-01 | Invoice list N+1 (`sumFeePayments` + per-row ACL) | Batched payment sums + matter ACL filter |
| P1-02 | Calendar list/create not assignment-scoped | Matter access on list + create |
| P1-03 | `/api/health` always 200 with broken env | Returns 503 when required env missing |
| P1-04 | Invoice number race | Atomic allocate via DB update returning |
| P1-05 | Export omitted Phase 3 money/ops tables | Export includes Phase 3 tables; BACKUP.md updated |
| P1-06 | `seed-phase3-demo` hang on `sql.end` | Force clean `process.exit(0)` after seed |

## P1 (ops) — still open

| ID | Issue | Owner |
|---|---|---|
| P1-OPS-01 | Railway production URL still TBD in README / HOSTING | Deploy + record before pilot invites |
| P1-OPS-02 | Verify `db:migrate` on empty Supabase project | Run once; harden vector extension if needed |

## P2 (defer)

- Auth-gate `/api/db-status` in production
- Remove unused `AUTH_SECRET` from required health/env (or document reserved)
- Refresh stale HOSTING “does not yet” Phase 0 wording
- Parallelize remaining dashboard count queries
- Dev password hygiene for production pilots

## Passed checks

- Login/session + `requirePermission` on billing/trust/intake/AI matter routes
- Trust ≠ fees (no mix paths found)
- AI grounding: not-found honesty; web lookup default OFF; firm memory matter-scoped
- Secrets: `.env*` gitignored; only `.env.example` tracked
- `railway.toml` health path + restart policy present
- `smoke:phase3` wired and documented

## Gate for pilots

1. Critical P1 code fixes merged (this gate)
2. Railway URL live + recorded
3. `npm run smoke:phase3` green against production URL
4. No P0 regressions

## Next

**Ready for P4-02** (Claude + OpenAI providers).
