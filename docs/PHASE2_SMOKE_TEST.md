# Phase 2 smoke test

Use after Phase 2 AI Assistant work (P2-01 to P2-14). App must be running.

```powershell
npm run dev

# Optional Railway:
# $env:SMOKE_BASE_URL = "https://YOUR-APP.up.railway.app"

npm run smoke:phase2
```

Also re-seed RBAC after permission matrix changes:

```powershell
npm run db:seed:rbac
```

Grounded answers and embeddings require `GEMINI_API_KEY` in `.env.local` (or Railway). Without the key, not-found / `missing_key` / blocked Legal Research paths are still valid smoke outcomes.

## Credentials (dev)

| User | Email | Password |
|---|---|---|
| Managing Partner | `mp@lexzim.local` | `<set-in-env>` |
| Junior | `junior@lexzim.local` | `<set-in-env>` |
| Accounts | `accounts@lexzim.local` | `<set-in-env>` |
| Isolation MP | `isolation@lexzim.local` | `<set-in-env>` |

## Checklist (P2-01 to P2-14)

| # | Check | How | Pass? |
|---|---|---|---|
| 1 | Login | `/login` as MP | |
| 2 | AI key / test | Settings → AI: Test connection / Dev ping (or honest missing-key status) | |
| 3 | Knowledge pack ingest | Settings → Knowledge pack → Re-ingest (pack ± embed) | |
| 4 | RAG diagnostic | Settings → RAG diagnostic: hits or empty with reason (no filler) | |
| 5 | Grounded ask | With key + embeddings: Constitution / Labour question → answer + citations + disclaimer | |
| 6 | Nonsense → not-found | Obscure question (or no embeddings): not-found / low confidence / empty citations / disclaimer | |
| 7 | Conversation persistence | Ask → sidebar thread → reopen loads transcript | |
| 8 | Matter Assist | `/ai` Matter Assist: summarise / pending procedures | |
| 9 | Unauthorized matter rejected | Isolation user matter-ask on pilot matter → 403 | |
| 10 | Draft merge ± AI | Matter Documents → Build preview → optional polish → Save; merge-only still works | |
| 11 | Web lookup default off | Settings → AI unchecked; `GET /api/ai/status` → `webLookupEnabled=false` | |
| 12 | Web UNVERIFIED (optional) | Enable toggle: web citations show `[UNVERIFIED]`; local RAG still primary | |
| 13 | AI down UX | Missing key: Legal Research Ask disabled; Matter Assist + core practice still work | |
| 14 | Audit events | Sensitive AI actions appear in audit (`ai.legal_ask`, `ai.matter_ask`, `ai.draft_*`, KB, firm memory) | |
| 15 | Role without `ai.use` blocked | `accounts@lexzim.local` → `/api/ai/ask` 403 | |
| 16 | Junior cannot manage AI settings/KB | Junior KB re-ingest / settings patch → 403 | |
| 17 | Firm memory RBAC | Isolation retrieve of pilot matter → 403 | |
| 18 | Railway / health | Local `GET /api/health` OK; production URL when set in `docs/HOSTING.md` | |

## Automated coverage

`npm run smoke:phase2` covers status, KB pack, not-found ask, conversation load, matter assist, unauthorized matter, draft preview/polish, accounts `ai.use` block, junior KB block, health.

Manual: grounded path (needs key + embeddings), web ON path, Railway URL, audit log UI review.

## Docs

- `docs/AI.md`
- `docs/KNOWLEDGE_BASE.md`
- `docs/FIRM_MEMORY.md`
- `docs/TEMPLATES.md`
- `docs/PHASE3_READY_CHECKLIST.md`

## Final statement

**PHASE 2 COMPLETE — ready for Phase 3 prompts (Calendar, Billing & Trust, Intake & Conflicts, Reporting)**
