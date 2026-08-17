# Phase 8 diagnosis (P8-11)

Rules first. Optional AI second opinion. Read-only: never writes production code, schema, or user data.

## Pieces

| Piece | Path |
|-------|------|
| Rules | `lib/diagnostics/rules.ts` |
| Diagnose pipeline | `lib/diagnostics/diagnose.ts` |
| AI opinion | `lib/diagnostics/ai-opinion.ts` (managed env keys only) |
| API | `GET/POST /api/ops/diagnostics/diagnose` |

## Rule examples

| Cause | Signal | Action |
|-------|--------|--------|
| `db.connectivity` | SQLSTATE 08xxx / `database_unavailable` | `runtime_heal` |
| `db.schema_mismatch` | 42703 / 42P01 / migrate hints | `inspect_health` |
| `db.circuit_open` | In-process circuit open | `runtime_heal` |
| `auth.credentials` | `invalid_credentials` | `none` (not an outage) |
| `auth.authorisation` / `licence.block` | 401/403 / licence_* | `none` |
| `exports.registry` | Unknown export kind | `propose_patch` / `retry` |
| `layout.overflow` | `ui.overflow_clip` etc. | `none` unless module is a blocker |

Confidence ≥ 80 skips AI unless `includeAi: true`. If AI is unconfigured, rules-only still works.

## Ops UI

Events tab: **Diagnose** on a request id. Shows summary, likely cause, confidence, alternatives, recommended action. No Apply fix for code (P8-13). When recommended action is `runtime_heal`, use the Runtime actions panel (P8-12).
