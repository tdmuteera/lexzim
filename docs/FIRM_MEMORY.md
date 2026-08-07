# Firm memory (P2-08)

Firm-scoped embeddings for Matter Assist. Only snippets are retrieved and later sent to the LLM, never the whole database.

## What is indexed

| Owner type | Source | Text |
|---|---|---|
| `matter_summary` | `matters` | Title, client, numbers, area, status, court/case, description |
| `matter_note` | `matter_events` | Timeline title + body |
| `document` | `documents` | Metadata only (title, file name, MIME, type). No binary extraction yet |

All rows in `ai_embeddings` for firm memory set **`firm_id`** (never NULL). System KB stays `firm_id` NULL with `owner_type=knowledge_chunk`.

## Re-index

| Action | Permission | API |
|---|---|---|
| `firm_memory_reindex_matter` | `ai.use` + matter access | `POST /api/ai/firm-memory` `{ "action": "reindex_matter", "matterId" }` |
| `firm_memory_reindex_all` | `ai.manage_settings` | `POST /api/ai/firm-memory` `{ "action": "reindex_all" }` |

Stats: `GET /api/ai/firm-memory`

UI: Settings → **Firm memory**

## Retrieval

`retrieveFirmContext` (`lib/ai/firm-memory/retrieve.ts`):

1. Require `matterId`
2. Enforce `userCanAccessMatter` (view_all vs assigned/team)
3. Embed query → cosine search over **this firm + this matter only**
4. Threshold (default 0.42) → empty hits if nothing clears it
5. Return snippets + citations only

API: `POST /api/ai/firm-memory/retrieve`

```json
{ "query": "next hearing", "matterId": "<uuid>" }
```

Cross-matter leakage is blocked by requiring `matterId` and joining owners filtered by that matter + `firm_id`.

## Code

- `lib/ai/firm-memory/build-text.ts`
- `lib/ai/firm-memory/index.ts` (reindex)
- `lib/ai/firm-memory/retrieve.ts`
- Audit: `ai.firm_memory_reindex_matter`, `ai.firm_memory_reindex_all`, `ai.retrieve_firm_context`

## Next

**P2-09:** Polish legal research AI chat UI + smoke test doc. Matter Assist answers use this in **P2-10**.
