# Phase 8 Runtime self-heal (P8-12)

Allowlisted runtime remediation only. No code patches, no trust/fee posting, no arbitrary SQL, no password changes, no production file edits.

## Allowlist (`action_code`)

| Code | Effect |
|---|---|
| `db.circuit_reset` | `prepareDbRetry()` when the in-process circuit is open |
| `db.pool_recycle` | `clearDbUnavailable()` + `resetDbClient()` (in-flight queries on the old client may fail) |
| `health.recheck` | Re-run `collectOpsDiagnosticHealth` |
| `job.requeue` | AI job by id: `failed` or `running` → `pending` |
| `cache.flush` | Flush in-process auth/RBAC hot caches (`flushAuthHotCaches`) |

Unknown codes return **400**.

## API

`GET /api/ops/diagnostics/repair/runtime`  
Allowlist + recent `runtime_heal` rows (`requireOpsAccess`).

`POST /api/ops/diagnostics/repair/runtime`  
Body: `{ action_code, diagnosis_id?, job_id?, repair_id?, confirm?: boolean }`

Two-step:

1. `confirm` omitted or `false` → insert `diagnostic_repair_actions` with `status=proposed`, audit `diagnostics.runtime_heal.proposed`.
2. `confirm: true` → execute (optionally continue via `repair_id`), store `result_safe`, audit `diagnostics.runtime_heal.executed` or `.failed`.

After execute: health recheck + follow-up diagnostic event (`runtime_heal.ok` / `runtime_heal.health_degraded` / `health.recheck.ok`).

## UI

`/ops/diagnostics` Events tab: **Runtime actions** panel.

- Unlocked when `diagnosis.recommendedAction === "runtime_heal"` **or** the selected action is `health.recheck`.
- Propose then Confirm execute. Shows last result.

## Safety

Trust ledgers and fee posts cannot be reached from this module. There is no Apply that writes source.
