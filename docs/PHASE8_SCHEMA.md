# Phase 8 diagnostics schema

**Migration:** `drizzle/migrations/0025_phase8_diagnostics.sql`  
**Drizzle:** `lib/db/schema.ts` (`diagnosticEvents`, `diagnosticSpans`, `diagnosticDiagnoses`, `diagnosticRepairActions`)  
**Types:** `lib/db/diagnostics-types.ts`  
**ADR:** `docs/PHASE8_ADR.md`

All four tables are **additive** and **platform-scoped**. They are not an extension of `audit_logs`. Product tables from Phases 0 to 7 are unchanged.

Never store passwords, JWTs, cookies, KYC, matter titles, trust/fee amounts, document bodies, or SMTP secrets. `firm_id` and `user_id` are UUIDs only. Redaction of `payload_json` is enforced in the app layer (P8-04), not by Postgres.

---

## Apply migration

```bash
npm run db:migrate
```

Run the same file against the project database before deploying code that writes these tables (P8-04 onward).

---

## `diagnostic_events`

One row per notable API, frontend, health, or worker signal, keyed by `request_id`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | Random |
| `request_id` | text | Correlation id (P8-03) |
| `created_at` | timestamptz | Default now |
| `source` | text | `api` \| `frontend` \| `health` \| `worker` |
| `level` | text | `debug` \| `info` \| `warn` \| `error` |
| `module` | text | Phase 8 module map (`auth`, `matters`, `finance.trust`, …) |
| `route` | text nullable | Path without query string |
| `http_method` | text nullable | |
| `http_status` | int nullable | |
| `error_code` | text nullable | App code, e.g. `database_unavailable` |
| `sqlstate` | text nullable | e.g. `42703`, `08006` |
| `message_safe` | text | Already redacted; app truncates to ~500 chars |
| `user_id` | uuid nullable | FK users, ON DELETE SET NULL |
| `firm_id` | uuid nullable | FK firms, ON DELETE SET NULL |
| `role` | text nullable | Role code, not email |
| `duration_ms` | int nullable | |
| `payload_json` | jsonb | Redacted metadata only |

**Indexes:** `request_id`, `created_at DESC`, `module`, `level`, `firm_id`.

---

## `diagnostic_spans`

Optional trace spans under the same `request_id`. Query names and table names only. Never SQL text with binds.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `request_id` | text | |
| `parent_span_id` | uuid nullable | Self-FK, ON DELETE SET NULL |
| `name` | text | e.g. `db.query`, `auth.session`, `gl.post` |
| `started_at` | timestamptz | |
| `duration_ms` | int nullable | |
| `ok` | boolean | Default true |
| `error_code` | text nullable | |

**Indexes:** `request_id`, `parent_span_id`.

---

## `diagnostic_diagnoses`

Rules or AI conclusion for a request. Evidence is IDs of events/spans, not payloads of client data.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `request_id` | text nullable | |
| `created_at` | timestamptz | |
| `summary` | text | |
| `likely_cause` | text | |
| `confidence` | int | 0 to 100 |
| `alternatives_json` | jsonb | List of alternate causes |
| `evidence_json` | jsonb | `{ eventIds, spanIds }` |
| `recommended_action` | text | `none` \| `retry` \| `inspect_health` \| `runtime_heal` \| `propose_patch` |
| `model_id` | text nullable | Set when AI ran |
| `created_by` | text | Ops user UUID or the literal `rules` |

**Indexes:** `request_id`, `created_at DESC`.

---

## `diagnostic_repair_actions`

Runtime heal attempts and patch proposals. Allowlist of `action_code` is enforced in the app (P8-12). This table does not grant SQL or trust posting.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `diagnosis_id` | uuid nullable | FK diagnoses, ON DELETE SET NULL |
| `created_at` | timestamptz | |
| `kind` | text | `runtime_heal` \| `patch_proposal` |
| `action_code` | text | e.g. `db.circuit_reset`, `cache.flush`, `job.requeue` |
| `status` | text | `proposed` \| `approved` \| `running` \| `succeeded` \| `failed` \| `rolled_back` \| `rejected` |
| `requested_by` | text nullable | Ops actor |
| `approved_by` | text nullable | |
| `executed_at` | timestamptz nullable | |
| `result_safe` | text nullable | Redacted result |
| `proposal_path` | text nullable | e.g. `docs/diagnostics/proposals/…` |

**Indexes:** `diagnosis_id`, `status`, `created_at DESC`.

---

## What this is not

| Table | Why not reused |
|-------|----------------|
| `audit_logs` | Firm product audit (who billed, who exported). Different audience and retention. |
| Railway stdout (`lib/ops/log.ts`) | Ephemeral. Phase 8 persists a redacted subset for lookup by `request_id`. |

Purging a firm sets `firm_id` / `user_id` to null on leftover events. Event rows themselves are not cascade-deleted, so ops can still inspect a timeline after a tenant purge.

---

## Next

P8-04 writes `diagnostic_events` from `jsonError` (5xx and DB outages always; 4xx sampled; `invalid_credentials` skipped). Ops lookup: `GET /api/ops/diagnostics/events?requestId=...` (`requireOpsAccess`). `recordSpan()` is available for named spans (never SQL text). Apply `0025_phase8_diagnostics.sql` before relying on persisted rows.

P8-05 expands health: `/api/health` stays cheap (env + in-process circuit). `/api/db-status` reports migrations pending vs journal, circuit state, and failureClass (`connectivity` vs `schema` vs `config`). Ops board: `GET /api/ops/diagnostics/health` (`requireOpsAccess`), writes a source=health snapshot event.

P8-06 adds `/ops/diagnostics`: health board, event search by requestId, timeline, copy id. Compact strip on the ops dashboard. Phase A complete.

P8-07 generates the module registry (`npm run diagnostics:registry` → `lib/diagnostics/registry.generated.ts`) plus `lib/diagnostics/registry.overlay.ts` (severity, owner, recovery hint, route prefixes). Merge: `getModuleRegistry()`. Ops: `GET /api/ops/diagnostics/registry` and the Diagnostics Registry tab. Refresh the generated file after nav, API, or schema changes. Do not encode workflow steps here (P8-08).

P8-08 adds seven workflow contracts (`lib/diagnostics/workflows.ts`), dependency graph JSON, `GET /api/ops/diagnostics/workflows`, Workflows tab, and `docs/PHASE8_WORKFLOWS.md`. Phase B complete.

P8-09 adds browser telemetry: `lib/diagnostics/client.ts`, `POST /api/diagnostics/client-event` (staff or ops, rate-limited), error boundaries with reference id, and adoption notes in `docs/PHASE8_FRONTEND.md`.

P8-10 adds known layout anomaly detectors (`lib/diagnostics/ui-anomalies.ts`), mount probes, and `npm run diagnostics:ui-anomalies`. Phase C complete.

P8-11 stores rows in `diagnostic_diagnoses` via `lib/diagnostics/diagnose.ts` (rules first, optional AI). Ops: `POST/GET /api/ops/diagnostics/diagnose`. Phase D complete.

P8-12 writes `diagnostic_repair_actions` (`kind=runtime_heal`) via `lib/diagnostics/runtime-heal.ts`. Ops: `POST/GET /api/ops/diagnostics/repair/runtime`. Allowlist enforced in app. Trust/fee posting is not reachable from this path.

P8-13 writes `diagnostic_repair_actions` (`kind=patch_proposal`) via `lib/diagnostics/patch-proposals.ts` and markdown under `docs/diagnostics/proposals/`. Ops: `POST/GET/PATCH /api/ops/diagnostics/repair/propose`. Status changes only; the app never writes production source.
