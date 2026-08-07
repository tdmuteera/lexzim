# LexZim AI (Phase 2)

## Permissions

| Permission | Who |
|---|---|
| `ai.use` | All roles (open AI assistant) |
| `ai.manage_settings` | Managing Partner only |

## Keys (P2-02)

| Mode | How |
|---|---|
| **Server default (Phase 2 testing)** | `GEMINI_API_KEY` in Railway / `.env.local` (server only, never sent to the browser) |
| **Firm BYO** | Stubbed as “coming” (Phase 4 / encrypted vault). Not stored in `ai_settings`. |

Settings → **AI**:
- Provider: Gemini
- Model: Flash (default `gemini-2.0-flash`)
- **Test connection** / **Dev ping**
- Help text explains LexZim-managed key for testing vs BYO later

APIs:
- `GET/PATCH /api/ai/settings` (`ai.manage_settings`)
- `POST /api/ai/test` → health check
- `POST /api/ai/ping` → `getProvider().chat()` ping (Managing Partner)

## Providers (P2-03)

Abstraction: `chat(messages)` + `embed(text)` via `getProvider(firmId)`.

| Provider | Status | Chat model ID | Embeddings model ID |
|---|---|---|---|
| **Gemini** | Live | `gemini-2.0-flash` | `text-embedding-004` (768-d) |
| Claude | Stub (Phase 4) | `claude-sonnet-4-5` | n/a |
| OpenAI | Stub (Phase 4) | `gpt-4.1` | `text-embedding-3-small` |

Code:
- `lib/ai/types.ts` — interface
- `lib/ai/errors.ts` — `MissingKey`, `InvalidKey`, `RateLimited`, `NetworkError`, `ProviderError`, `NotImplemented`
- `lib/ai/providers/gemini.ts` — Flash chat + embeddings
- `lib/ai/providers/claude.ts` / `openai.ts` — stubs
- `lib/ai/providers/index.ts` — `getProvider()` from `ai_settings` + secrets

Switching later: implement Claude/OpenAI against the same interface and set `ai_settings.provider_default`.

## Schema (P2-01)

| Table | Purpose |
|---|---|
| `ai_settings` | Per-firm provider/model prefs. **No API keys.** |
| `ai_conversations` | Chat threads |
| `ai_messages` | Turns + confidence + citations |
| `knowledge_sources` / `knowledge_chunks` | Zimbabwe KB |
| `ai_embeddings` | pgvector |
| `ai_usage_events` | Usage audit (no secrets) |

## Knowledge pack (P2-04 / P2-05)

- Starter Zimbabwe corpus with provenance (`docs/KNOWLEDGE_BASE.md`)
- Settings → **Knowledge pack** → Re-ingest (pack + embed) or Embed only
- APIs: `GET/POST /api/ai/knowledge` with `mode`: `all` | `pack` | `embed`

### Embeddings (P2-05)

| Item | Detail |
|---|---|
| Chunking | ~500–800 tokens, ~100-token overlap; `heading_path` preserved (`lib/ai/kb/chunker.ts`) |
| Embed model | Gemini `text-embedding-004` (768-d) via `provider.embed()` |
| Storage | `ai_embeddings` (`owner_type=knowledge_chunk`, HNSW cosine index) |
| Idempotency | Pack replace by `lexzim-starter-pack-v1`; embeddings upsert on `(owner_type, owner_id, model_name)` |
| Failures | Missing/invalid key or network stops early; UI shows step progress |

### Retrieval (P2-06)

`retrieveLegalContext(query)`:

1. Embed the query with Gemini embeddings  
2. Cosine similarity search over system `ai_embeddings` (top candidates)  
3. Drop scores below `minSimilarity` (default **0.42**) → **empty hits, no filler**  
4. Dedupe by source (keep best chunk per source), return top K with citation fields  
5. `retrieval_meta` always included  

API: `POST /api/ai/retrieve` (`ai.use`)

```json
{ "query": "unfair dismissal", "diagnostic": true }
```

`diagnostic: true` requires `ai.manage_settings` (Settings → **RAG diagnostic**).

## Answer generator (P2-07)

Pipeline (`lib/ai/rag/answer.ts` → `aiLegalAsk`):

1. `retrieveLegalContext(question)`
2. **Empty hits:** fixed not-found text, confidence `low`, citations `[]`, disclaimer included. No LLM call that invents authorities.
3. **Hits:** strict Zimbabwe-only system prompt → Gemini `chat()` → answer + `citations_json` from retrieval + confidence (high/medium/low) + mandatory disclaimer.

API: `POST /api/ai/ask` (`ai.use`)

```json
{ "question": "What does the Constitution say about equality?", "conversationId": null }
```

UI: **AI Assistant** (`/ai`) legal research chat. Conversations/messages persist (`ai_conversations` / `ai_messages`). Audit: `ai.legal_ask`.

No matter context yet (P2-10). No web search yet.

### Sample transcript (not-found path, no embeddings / no hits)

**User:** What is the limitation period for a delict claim in Zimbabwe?

**Assistant:** I could not find sufficiently relevant material in the LexZim Zimbabwe knowledge base for this question.

I will not invent statutes, section numbers, or case names. Please rephrase the question, re-ingest/embed the knowledge pack if embeddings are missing, or consult primary sources directly.

Disclaimer: LexZim AI is a research aid for Zimbabwe legal practitioners. It is not final legal advice. Verify all authorities against primary sources (ZimLII, Veritas, official gazettes) before relying on this answer in practice or court.

*(confidence: low · citations: [])*

### Sample transcript (grounded path, after embed)

**User:** Unfair dismissal under the Labour Act

**Assistant:** *(model answer grounded only in retrieved Labour Act / related starter-pack chunks, with citation labels)*

Citations: e.g. Labour Act [Chapter 28:01] (excerpt from retrieved chunk)

Disclaimer: … *(same mandatory text)*

*(confidence: medium or high depending on hit count / similarity)*

## Firm memory (P2-08)

See `docs/FIRM_MEMORY.md`.

Index matter summaries, timeline notes, and document metadata into firm-scoped `ai_embeddings` (`firm_id` set). Retrieve with `retrieveFirmContext` (always requires `matterId` + RBAC).

APIs:
- `GET/POST /api/ai/firm-memory` (reindex matter / reindex all)
- `POST /api/ai/firm-memory/retrieve`

Settings → **Firm memory**. Used by Matter Assist in P2-10 (not wired into legal research answers).

## Legal research chat UI (P2-09)

`/ai` Legal Research assistant (navy/teal LexZim styling):

- Conversation list + persisted transcript (`GET /api/ai/conversations`, `GET /api/ai/conversations/[id]`)
- Confidence badge, citations, disclaimer in answers via `POST /api/ai/ask`
- KB version chip + readiness banners (`GET /api/ai/status`)
- Empty states for missing API key / empty KB / embeddings not ready
- Matter Assist tab reserved (P2-10)

Smoke checklist: `docs/PHASE2_SMOKE_TEST.md`

## Matter Assist (P2-10)

Mode tab on `/ai`. Requires matter access (`userCanAccessMatter`).

Pipeline (`aiMatterAsk`):
1. Verify access
2. Live matter snapshot (summary, pending procedures, recent notes, doc metadata)
3. `retrieveFirmContext` (this matter only)
4. Optional Zimbabwe legal RAG (no invented authorities if empty)
5. LLM answer or deterministic snapshot fallback if key/provider fails
6. Confidence, citations, matter disclaimer; audit `ai.matter_ask`

API: `POST /api/ai/matter-ask` `{ "matterId", "question", "conversationId?" }`

## Drafting (P2-11)

AI-assisted drafting starts from **Phase 1 firm templates only** (no invented official forms).

Flow (Matter → Documents → Generate from template):

1. Select template + merge fields → **Build preview** (deterministic `{{FIELD}}` merge → plain text)
2. Optional **Polish with AI** (matter notes / firm memory; fails open to merge-only text)
3. Editable preview with banner: **AI draft — review before filing or service**
4. **Save to matter** as `.docx` (no auto-send)

Merge-only shortcut still available (original generate path, no text review).

API: `POST /api/matters/[id]/draft`

| action | Purpose |
|---|---|
| `preview` | Merge template → plain text (no save) |
| `polish` | Optional AI polish (`ai.use`) |
| `save` | Pack plain text → matter document |

Code: `lib/ai/drafting/polish.ts`, `lib/templates/merge.ts` (`extractPlainTextFromDocx`), `lib/templates/pack-text.ts`

## Offline / error behaviour (P2-12)

Honest failure modes on the web app:

| State | UI behaviour |
|---|---|
| Missing / invalid key | Banner; Legal Research **Ask** disabled with clear reason |
| Provider unreachable / rate limited | Banner; Legal Research send disabled; **Recheck** re-probes |
| Embeddings / KB not ready | Send disabled for Legal Research until pack is embedded |
| Transient 429 / 502 / 503 | Client retries with exponential backoff; Gemini chat/embed also retry server-side |

Matter Assist can still answer from **live matter facts** when the LLM/key is down.

**Core practice stays up:** matters, clients, documents, templates, procedures, search, and export work even if AI is unavailable.

`GET /api/ai/status?probe=1` returns connectivity + `canSendLegalResearch` / `sendBlockedReason` / `corePracticeNote`.

Ollama / offline desktop fallback is **out of scope** for the web SaaS MVP (optional future).

## Web lookup (P2-13)

Optional allowlisted lookup (default **OFF**). Managing Partner enables via Settings → AI (`ai.manage_settings`).

| Rule | Behaviour |
|---|---|
| Allowlist | ZimLII, Veritas Zimbabwe, Parliament of Zimbabwe |
| Labels | Every web hit / citation is **`[UNVERIFIED]`** (`verified: false`) |
| Order | Local RAG always runs first |
| Override | Web never silently replaces local grounding |
| Failure | Network/timeout → local only (no hard fail) |

Code: `lib/ai/web/trusted-lookup.ts` (wired in `aiLegalAsk`).

## Accuracy & ethics (Phase 2)

1. Zimbabwe context only for legal research.
2. No fake cases / invented sections.
3. Citations when authority is claimed.
4. Confidence shown.
5. Honest not-found.
6. Disclaimer + lawyer-in-the-loop.
7. Keys server-side only.
8. `firm_id` + RBAC for firm memory.
9. Web results labelled UNVERIFIED.

## Status

**PHASE 2 COMPLETE — ready for Phase 3 prompts (Calendar, Billing & Trust, Intake & Conflicts, Reporting)**

Smoke: `docs/PHASE2_SMOKE_TEST.md` / `npm run smoke:phase2`  
Handoff: `docs/PHASE3_READY_CHECKLIST.md`
