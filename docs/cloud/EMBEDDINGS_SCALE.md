# Embeddings & scale workers (P5-09)

Long KB / firm-memory embedding jobs can exceed Railway web request budgets. LexZim keeps **Supabase pgvector** (no third-party vector SaaS without a new ADR) and moves heavy work onto a **Postgres job queue**.

## Decision (MVP)

| Option | Choice |
|--------|--------|
| Queue | `ai_jobs` table in app Postgres |
| Processor | `npm run jobs:ai` / `jobs:ai:loop` (Node + existing embed helpers) |
| Deploy | Optional second Railway service **or** Cron hitting the same script; web dyno also kicks jobs in-process after enqueue for pilots |
| Rejected for MVP | Supabase Edge rewrite of Drizzle/providers; Pinecone/Weaviate/etc. |

Grounding rules in `docs/AI.md` are unchanged: workers only call existing `kbReingestAll` / `embedSystemKnowledgeChunks` / `firmMemoryReindex*`.

## Job types

| `job_type` | Trigger |
|------------|---------|
| `kb_reingest_all` | Settings → Re-ingest knowledge pack (`POST /api/ai/knowledge` mode `all`) |
| `kb_embed` | Embed chunks only (`mode: embed`) |
| `firm_memory_reindex_all` | Firm memory reindex all |
| `firm_memory_reindex_matter` | Reserved (single-matter stays sync by default) |

Statuses: `pending` → `running` → `completed` | `failed`.

## APIs

| Path | Notes |
|------|--------|
| `POST /api/ai/knowledge` | Heavy modes return **202** + `job` (unless `{ "async": false }`) |
| `POST /api/ai/firm-memory` | `reindex_all` queued by default |
| `GET /api/ai/jobs/{id}` | Poll status |
| `GET /api/ai/jobs/recent` | Recent firm jobs |

## Run locally

```bash
npm run db:migrate
npm run jobs:ai          # process one pending job
npm run jobs:ai:loop     # poll every AI_JOBS_POLL_MS (default 5000)
```

## Railway worker (optional)

1. Add a second service from the same repo.
2. Start command: `npm run jobs:ai:loop`
3. Same `DATABASE_URL`, Supabase, and AI provider env as the web service.
4. No public HTTP / health required for MVP (or add a tiny health later).

Web can keep using in-process `kickAiJobInBackground` for small firms; add the worker when reindex saturates CPU or when you disable in-process kicks.

## Ops tips

- Prefer off-peak re-ingest for large packs.
- Stale `running` jobs older than ~45 minutes are requeued by the worker.
- Monitor provider rate limits and Railway memory during embed bursts.
- Region / data residency remains the Supabase project region (document choice for clients).

## Related

- `docs/AI.md`, `docs/KNOWLEDGE_BASE.md`, `docs/RAILWAY.md`
- `docs/cloud/ADR_PHASE5.md`, `THREAT_MODEL.md` (T9)
