# Architecture: Phase 4 (Sell & Ship)

Phase 4 packages LexZim for hosted pilots: production AI providers, licensing, editions, onboarding, ops docs, and Railway hardening. Practice modules from Phase 3 stay in place.

## Scope delivered

- Production AI: Gemini, Claude, OpenAI (BYO encrypted keys or managed env)
- Routing, soft budgets, safety defaults (web lookup off, disclaimer on)
- Firm licences (`trial` / `solo` / `firm`) with expiry that never blocks export
- Edition feature flags and seat limits
- Optional AI proxy (Firm edition)
- Versioning, About, changelog, releasing runbook
- Railway Node 20, health/restart, redacted logs, secrets/domain notes
- Soft onboarding checklist + firm profile
- End-user Help (`docs/user/` → `/help/[slug]`)
- Sales docs (`docs/sales/`) and ops docs (`docs/ops/`)
- Safe diagnostics download (no matter contents, no auto-upload)
- Phase 4 release smoke (`npm run smoke:phase4`)

## Explicitly not delivered

- Windows/Mac installers, Tauri, code signing
- Public client portal (Phase 5)
- Self-serve payment checkout for licences (manual / CLI OK for pilots)
- New practice modules beyond Phase 3
- Guaranteed offline or air-gapped AI

## Runtime

```text
Browser (HTTPS)
  → Next.js on Railway
    → Supabase Auth + Postgres + Storage (+ pgvector)
      → firm_id tenant scope + RBAC
        → licence / seats / AI providers / practice repos
```

## Commercial spine

```text
firm
├── firm_licences (edition, seats, expiry, features)
├── users (seat-counted when active)
├── ai_settings + BYO keys (encrypted) / managed env
├── optional firm_ai_proxy credentials
├── firm_settings (billing prefs, onboarding flags, last_export_at)
└── export archive (always allowed)
```

## Safety rules that remain true

1. Never ship provider master keys to the browser
2. BYO vs managed modes stay explicit
3. Export remains available on licence expiry
4. Trust ≠ fees
5. Conflict gate before intake conversion
6. `firm_id` on every firm-scoped query

## Folder map

| Area | Paths |
|------|-------|
| Licensing | `lib/licensing/*`, `lib/repos/licences.ts`, `app/api/licence`, `app/api/platform/licences` |
| AI Phase 4 | `lib/ai/providers/*`, `lib/repos/ai-settings.ts`, `app/api/ai/*`, `docs/AI.md`, `docs/AI_PROXY.md` |
| Onboarding | `lib/onboarding/*`, `app/api/onboarding`, `app/api/firm/profile`, `components/onboarding` |
| Help | `docs/user/*`, `lib/help/*`, `app/(platform)/help` |
| Ops / sales | `docs/ops/*`, `docs/sales/*` |
| Diagnostics | `app/api/diagnostics` |
| Deploy | `railway.toml`, `docs/RAILWAY.md`, `docs/PRODUCTION_SECRETS.md` |
| Smoke | `scripts/phase4-smoke.ts`, `docs/PHASE4_SMOKE_TEST.md` |

## Verification

```powershell
# Prefer staging/production when available:
# $env:SMOKE_BASE_URL = "https://YOUR-APP.up.railway.app"
npm run smoke:phase4
```

See `docs/PHASE4_SMOKE_TEST.md` and `docs/PHASE5_READY_CHECKLIST.md`.

## Next phase boundary

Open **Phase 5 prompts** only after Phase 4 is marked complete. Phase 5 is client portal, privacy/retention tooling, and scale beyond free hosting tiers. Do not implement those under Phase 4 prompts.
