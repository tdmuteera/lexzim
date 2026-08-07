# Zimbabwe knowledge base (P2-04)

## Purpose

Starter corpus for LexZim RAG plumbing. **Zimbabwe only.** Every source has provenance. Marked **starter / demo quality**.

This pack is **not** a full statute database. Prefer ZimLII, Veritas, and official gazetted text for live advice.

## Pack version

`lexzim-starter-pack-v1`

## Sources included

| Topic | Citation label (pack) | Attribution |
|---|---|---|
| Constitution (2013) excerpts | Constitution of Zimbabwe, 2013 — starter pack | Veritas / Government / ZimLII |
| Labour Act | Labour Act [Chapter 28:01] — starter pack | ZimLII / Government |
| Criminal Law Code | Criminal Law (Codification and Reform) Act [Chapter 9:23] — starter pack | ZimLII / Government |
| COBEA | Companies and Other Business Entities Act [Chapter 24:31] — starter pack | ZimLII / Government |
| Marriages Act | Marriages Act [Chapter 5:15] (related family statutes) — starter pack | ZimLII / Veritas |
| Deeds Registries | Deeds Registries Act [Chapter 20:05] — starter pack | ZimLII / Government |
| Civil Evidence | Civil Evidence Act [Chapter 8:01] — starter pack | ZimLII / Government |
| High Court Rules | High Court Rules (Zimbabwe) — starter pack | Judiciary / ZimLII |
| Magistrates Court Rules | Magistrates Court (Civil) Rules — starter pack | Judiciary / ZimLII |

## Rules

- No aggressive runtime scraping
- Conservative on case law (no invented citations)
- System rows use `knowledge_sources.firm_id = NULL`
- Chunks store `metadata_json.quality = "starter_demo"`
- Embeddings: Gemini `text-embedding-004` (768-d) into `ai_embeddings` (P2-05)

## How to load

Managing Partner: **Settings → Knowledge pack → Re-ingest knowledge pack**

This runs pack reload + Gemini embeddings (needs `GEMINI_API_KEY`).

Or API:

```http
POST /api/ai/knowledge
Content-Type: application/json

{ "mode": "all" }
```

Modes: `all` (default), `pack` (text only), `embed` (embeddings only).

Requires `ai.manage_settings`.

### Idempotency

1. Removes prior system rows with `version_label = lexzim-starter-pack-v1` (and their embeddings).
2. Inserts fresh sources/chunks (chunked ~500–800 tokens with overlap).
3. Upserts `ai_embeddings` per chunk + model (`text-embedding-004`).

Status:

```http
GET /api/ai/knowledge
```

Returns source/chunk/embedding counts and `embeddingsReady`.

## Retrieval

`retrieveLegalContext` embeds the query, cosine-searches system embeddings, drops scores below 0.42 (empty hits, no filler), dedupes by source, returns citations.

Optional web lookup (P2-13) is separate, default off, and never silently overrides local RAG.

## Code

- `lib/ai/kb/starter-pack.ts` — corpus definitions
- `lib/ai/kb/chunker.ts` — token windows + overlap
- `lib/ai/kb/ingest-starter.ts` — load/replace + `kbReingestAll`
- `lib/ai/kb/embed-chunks.ts` — pgvector writes
- `lib/ai/rag/retrieve.ts` — retrieval
- `app/api/ai/knowledge/route.ts` — status + re-ingest

## Related

- `docs/AI.md`
- `docs/PHASE2_SMOKE_TEST.md`
