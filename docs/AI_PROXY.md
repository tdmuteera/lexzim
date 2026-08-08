# LexZim AI Proxy (P4-06)

Optional licensed AI proxy so LexZim can hold provider master keys off the firm browser and off optional desktop clients. Firms authenticate with a per-firm licence proxy token. Master keys never go into `NEXT_PUBLIC_*` or client bundles.

## Modes

| App `key_mode` | Behaviour |
|---|---|
| `direct` (default) | Firm BYO keys and/or server `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` |
| `proxy` | Firm edition only (`canUse('ai_proxy')`). App calls proxy with stored firm token |

## Endpoints (MVP)

Embedded in the main Next.js app (simplest Railway deploy):

- `POST /api/ai/proxy/v1/chat` — Bearer firm token
- `POST /api/ai/proxy/v1/embed` — Bearer firm token
- `GET/POST /api/ai/proxy/token` — Managing Partner issue/rotate/revoke (`ai.manage_settings`)

Optional standalone process (separate Railway service):

```bash
npx tsx --tsconfig tsconfig.json services/ai-proxy/src/server.ts
```

- `GET /health`
- `POST /v1/chat`
- `POST /v1/embed`

Point the app at it with `AI_PROXY_URL=https://your-proxy.up.railway.app` (no `/v1` suffix; client appends `/v1/chat`).

## Auth & quotas

- Token format: `lzp_…` (shown once on issue; hash stored in `firm_ai_proxy`)
- Encrypted client copy kept in firm settings for app→proxy calls
- Monthly soft quota per firm (default 500 proxy calls)
- Edition gate: Firm (`ai_proxy`); Trial/Solo cannot enable proxy mode

## Env (proxy / app server)

```
GEMINI_API_KEY=
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
AI_PROXY_TOKEN_PEPPER=   # or AUTH_SECRET
AI_PROXY_URL=            # optional; defaults to NEXT_PUBLIC_APP_URL/api/ai/proxy
DATABASE_URL=            # required for token + quota tables
```

## Security rules

1. Never put master keys or firm proxy tokens in client JS or `NEXT_PUBLIC_*`.
2. Rotate tokens from Settings → AI if leaked.
3. Revoke disables proxy mode credentials; switch firm back to Direct if needed.
4. Export never includes decrypted tokens (sensitive settings strip).

## Firm UI

Settings → AI:

1. Issue / rotate LexZim Proxy token (Firm edition)
2. Set Key mode to LexZim Proxy
3. Save

See also `docs/EDITIONS.md` and `docs/AI.md`.
