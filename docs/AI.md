# LexZim AI (Phase 2)

## Permissions

| Permission | Who |
|---|---|
| `ai.use` | All roles (open AI assistant) |
| `ai.manage_settings` | Managing Partner only |

## Keys (P4-02)

| Mode | How |
|---|---|
| **Managed (server env)** | `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` on Railway / `.env.local` |
| **Firm BYO** | Settings → AI: optional encrypted per-firm keys (`ai_byo_*` in `firm_settings`, stripped from export). BYO wins over env for that firm. |

Vault encryption uses `AI_VAULT_SECRET` (or `AUTH_SECRET` fallback). Never return raw keys to the browser.

Settings → **AI**:
- Provider select: Gemini | Claude | OpenAI
- Chat + embeddings model defaults
- **Test connection** / **Dev ping** (uses `getProvider()`)
- Optional BYO key fields

APIs:
- `GET/PATCH /api/ai/settings` (`ai.manage_settings`)
- `POST /api/ai/test` → health check for the selected provider
- `POST /api/ai/ping` → `getProvider().chat()` ping

## Providers (P4-02)

Abstraction: `chat(messages)` + `embed(text)` via `getProvider(firmId)`. RAG safety rules unchanged.

| Provider | Status | Chat model ID | Embeddings |
|---|---|---|---|
| **Gemini** | Live | `gemini-2.0-flash` | `text-embedding-004` (768-d) |
| **Claude** | Live | `claude-sonnet-4-5` | No native embed. **Falls back to Gemini** when a Gemini key is present |
| **OpenAI** | Live | `gpt-4.1` | `text-embedding-3-small` with `dimensions=768` to match `ai_embeddings` |

Code:
- `lib/ai/types.ts` — interface
- `lib/ai/providers/gemini.ts` / `claude.ts` / `openai.ts`
- `lib/ai/providers/index.ts` — `getProvider()`
- `lib/ai/secrets.ts` — managed + BYO resolution

All AI paths (ask, matter-ask, draft polish, KB embed, firm memory, status) use `getProvider()`.

## Routing, budgets & safety (P4-03)

| Setting | Default | Behaviour |
|---|---|---|
| `routing_mode` | `auto` | Legal research prefers **Claude** when a Claude key is present, else **Gemini Flash**. Other modes use `provider_default`. `manual` always uses the selected provider. |
| `monthly_soft_budget` | `500` | Soft cap on firm `ai_usage_events` per UTC month. At limit, new LLM chats soft-block (429). `null` / unlimited clears the cap. |
| `max_output_tokens` | `1200` | Applied to legal / matter / draft chat calls (clamped 256–4096). |
| `web_lookup_enabled` | `false` | Stays off unless Managing Partner enables it. |
| `matter_context_enabled` | `true` | When false, Matter Assist refuses matter-file context. |
| Disclaimer | always on | Cannot be disabled; answers append the mandatory disclaimer. |

Settings → **AI** includes routing, safety toggles, and **Usage** (this month’s call counts + budget).

APIs: `GET /api/ai/usage` (`ai.manage_settings`).

Code: `lib/ai/routing.ts`, `lib/ai/budget.ts`, `getProvider(firmId, { mode })`.

## LexZim AI Proxy (P4-06)

Optional Firm-edition mode. Master provider keys stay on the proxy/app server. Firms use a `lzp_` token (Settings → AI). See `docs/AI_PROXY.md`.

| Item | Detail |
|---|---|
| `key_mode` | `direct` (BYO/managed) or `proxy` |
| Endpoints | `/api/ai/proxy/v1/chat`, `/v1/embed`; optional `services/ai-proxy` |
| Gate | `canUse('ai_proxy')` (Firm edition) |

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
- **Citation URLs:** starter sources use Act-specific ZimLII/Veritas **search** links (not bare homepages). Runtime deepen (`lib/ai/citations/authority-urls.ts`) also upgrades shallow URLs. If the DB still has old homepage `source_url` values, re-run pack ingest via Settings → Knowledge pack → Re-ingest (or `POST /api/ai/knowledge` with `mode: "all"`). There is no separate `npm` ingest-starter script.

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

1. Classify intent (chat / legal / document).
2. Retrieve local legal context (skipped for pure chat).
3. Optional allowlisted web lookup (legal only). **Default ON** for richer Zimbabwe links; firm may disable in Settings → AI.
4. Generate via configured provider (Gemini / Claude / OpenAI).
5. **Verify pass (P10-15):** deterministic claim/citation overlap vs sources; drop unsupported citations; lower confidence; optional hedge when weak (`lib/ai/rag/verify.ts`). Summary stored in `retrievalMetaJson.verify`.
6. Citations shown for legal turns only (precise Act/section labels when heading path exists; UI caps at **3**, prefers answer overlap, deepens shallow homepage links to publisher search). Chat/greetings: empty citations. In the UI, Sources start **collapsed** behind Show sources / Hide sources.

API: `POST /api/ai/ask` (`ai.use`)

```json
{ "question": "What does the Constitution say about equality?", "conversationId": null }
```

**Edit + regenerate:** `POST /api/ai/conversations/[id]/regenerate` with `{ messageId, content }` updates the user message, truncates later turns, then runs ask with `skipCreateUserMessage` so the user row is not duplicated.

**Dictate:** `POST /api/ai/transcribe` (multipart `file`) via OpenAI Whisper when an OpenAI key is available.

UI: **AI Assistant** (`/ai`) legal research chat. Conversations/messages persist (`ai_conversations` / `ai_messages`). Audit: `ai.legal_ask` / `ai.legal_regenerate`.

### Document house style (P10-15)

AI Word exports (`packInstructionDocx` / chat document packing) default to Trebuchet MS, 12pt, 1.5 line spacing, justified, plain black (`lib/ai/drafting/house-style.ts`). User overrides only when they explicitly request another font/size/spacing. Invoice letterhead fonts are unchanged.

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

## Drafting (P2-11, house style + red placeholders updated P-AI-reset)

AI-assisted drafting starts from **Phase 1 firm templates only** (no invented official forms), and the AI chat assistant can also draft full, ready-to-use documents directly (letters, notices, affidavits, agreements) via `/ai` when asked.

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

### House style + placeholders (P-AI-reset)

Every AI-generated Word document uses Trebuchet MS, 12pt, 1.5 line spacing, justified, black — unless the user explicitly asks for different formatting (`lib/ai/drafting/house-style.ts`, `lib/ai/intent.ts::parseDocxStyle`). The model is instructed to leave any fact it does not have as a `[BRACKETED PLACEHOLDER]`; the docx generator (`lib/ai/drafting/instruction-docx.ts`) automatically renders those bracketed spans in **red** so a lawyer can see at a glance what still needs to be filled in before sending. Everything else in the document stays normal black text. Documents are always the full, ready-to-use body — never a chat summary pasted into a file.

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

## Web lookup (P-AI-reset)

Live web search is a real, independent research step — not a static allowlist scrape. It runs via the **OpenAI Responses API `web_search` tool** whenever the firm has an OpenAI key configured, regardless of which provider (OpenAI/Claude/Gemini) writes the final chat answer. Managing Partner may disable it via Settings → AI (`ai.manage_settings`, `ai_settings.web_lookup_enabled`).

| Rule | Behaviour |
|---|---|
| Scope | Full web, not restricted to a fixed allowlist — the model may cite any verifiable page it actually retrieves |
| Reliable sources | ZimLII, Veritas Zimbabwe, Parliament of Zimbabwe, Ministry of Justice, JSC, ZIMRA, RBZ, Law Society of Zimbabwe, ZHRC are ranked/checked first (`lib/ai/web/trusted-sites.ts`) — a ranking hint, never a hard restriction |
| Labels | Web-sourced citations carry `verified: false` and `verificationStatus: "web_consulted"`; the UI never presents them as primary legislation |
| Order | Local knowledge base always runs first; web search runs alongside it as a second, independent source |
| Real links only | Every hit is a URL the model's own `url_citation` annotation actually returned — nothing is invented |
| Failure | No OpenAI key / network / timeout → local knowledge only, no hard fail |
| Currency | This is how brand-new gazetted law (days old) can still be found and cited |

Code: `lib/ai/web/openai-web-search.ts` (the search call), `lib/ai/web/trusted-lookup.ts` (firm-scoped wrapper + ranking), wired in `aiLegalAsk` and `aiMatterAsk`.

## Sources tiering & honesty (P-AI-reset)

Every legal or drafting answer runs through a **verify pass** (`lib/ai/rag/verify.ts`) before anything is shown as a source. `lib/ai/citations/tiers.ts` splits the result into what the chat UI renders:

| Tier | Meaning |
|---|---|
| **Primary sources** | Verified local knowledge-base authorities (Acts/sections actually retrieved and pinpointed) |
| **Other sources consulted** | Relevant live web results that informed the answer but are not primary legislation text |
| **Further reading** | Related but not directly relied-on citations (rejected by the relevance gate but still worth checking), categorized as statute / case law / treaty / secondary |

A candidate source only reaches "Primary" or "Other sources consulted" if it is topically relevant to the question **and** answer (cross-domain and off-topic matches — e.g. ZIMRA on a criminal-law question — are dropped, never shown). If neither the knowledge base nor a live web search finds anything relevant to a specific legal claim, the assistant is instructed to say so plainly (no fabricated citation to fill the gap) before giving a general-knowledge answer.

## Accuracy & ethics (Phase 2, updated P-AI-reset)

1. Zimbabwe context only for legal research (unless the user asks about another jurisdiction).
2. No fake cases / invented sections / invented URLs.
3. Every legal claim traceable to a real, clickable source shown under **Show sources**.
4. Irrelevant sources are never shown — a domain/topic relevance gate filters candidates before display.
5. Confidence and grounding status shown.
6. Honest not-found: the assistant says so when it found nothing verifiable, rather than padding the list.
7. Disclaimer + lawyer-in-the-loop.
8. Keys server-side only; never shipped to the browser.
9. `firm_id` + RBAC for firm memory.
10. Web-sourced citations are always labelled distinctly from verified local authorities.

## Conversation retention (P5-12)

Minimize stored AI chat: default **90 days** from conversation `updated_at`.

- Settings → AI → **Purge old AI conversations**
- API: `GET/POST /api/ai/retention`
- Cron/ops: `npm run privacy:purge-ai` (optional `--firm=`, `--days=`, `--dry-run`)
- Override: `AI_CONVERSATION_RETENTION_DAYS` or firm setting `ai_conversation_retention_days`

Does not delete KB embeddings. Privacy template: `docs/cloud/PRIVACY.md`.

## Status

**PHASE 2 COMPLETE. Ready for Phase 3 prompts (Calendar, Billing & Trust, Reporting)**

Smoke: `docs/PHASE2_SMOKE_TEST.md` / `npm run smoke:phase2`  
Handoff: `docs/PHASE3_READY_CHECKLIST.md`
