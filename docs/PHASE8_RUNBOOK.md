# Phase 8 DevOps runbook

How to triage LexZim failures with request correlation, `/ops/diagnostics`, runtime heal, and patch proposals. Product behaviour of Phases 0 to 7 is unchanged. Payroll stays Phase 6B.

## 1. Copy a `requestId` from a user screenshot

1. Ask the user for the failure screen (or Support ticket text).
2. Look for **Reference:** followed by a UUID-like token (also shown as `requestId` in API JSON).
3. Managing Partners may see the same reference on failed product actions (login, dashboard, invoice create, matter save). Lawyers should not see stack traces or SQL.
4. Copy the token only (no cookies, passwords, or Authorization headers).
5. Open `/ops/diagnostics` → **Events**, paste into Request id, Search.

If there is no reference id, use Health + time window search (module / level / last N hours), then Diagnose once you have a `requestId`.

## 2. Where to look in `/ops/diagnostics`

| Tab | Use for |
|---|---|
| **Health** | Env, DB, circuit, migration/schema signals, functional checks |
| **Events** | Timeline by `requestId`, Diagnose, Runtime actions |
| **Registry** | Module map (nav, APIs, tables, severity, recovery hints) |
| **Workflows** | Seven v1 contracts (login, client, matter, invoice, fee payment, trust receipt, export) |
| **Proposals** | Markdown patch proposals (human apply only) |

Platform admin + `requireOpsAccess` (and `OPS_IP_ALLOWLIST` when set). Firm `/audit` is separate and must not hold raw technical traces.

## 3. Health vs db-status vs platform health

| Endpoint | Audience | What it answers |
|---|---|---|
| `GET /api/health` | Load balancer / cheap liveness | Env flags present? Returns JSON with `ok` boolean (200 or 503). Does **not** prove query success. |
| `GET /api/db-status` | DevOps | Can we `select 1`? pgvector / `app_meta`? Circuit? Never returns `postgres://` URLs or passwords. |
| `GET /api/platform/health` | Ops console | Firm/licence/AI queue style ops metrics. Not a request timeline. |
| `GET /api/ops/diagnostics/health` | Ops Diagnostics | Broader snapshot used by the Health tab and after runtime heal. |

Rule of thumb: **unreachable DB / open circuit** → connectivity path. **Migrations pending / schema mismatch** → migrate path. Do not treat them as the same.

## 4. `circuit_reset` vs `db:migrate`

| Symptom | Action |
|---|---|
| Transient timeouts, circuit open, pool confusion after a blip | Runtime heal `db.circuit_reset` (then `health.recheck`). Optionally `db.pool_recycle` if you understand in-flight risk. |
| New deploy, missing tables/columns, migration not applied | Run `npm run db:migrate` (or your Railway migrate step) against the right database. **Schema mismatch is not connectivity.** |
| `db-status` says connected but app errors on missing relation | Migrate / schema. Resetting the circuit will not create tables. |

Never run arbitrary SQL from Diagnostics. Never use runtime heal to “fix” a missing migration.

## 5. Runtime heal: may vs must never

**May (allowlisted, propose then confirm):**

- `db.circuit_reset`
- `db.pool_recycle`
- `health.recheck`
- `job.requeue` (AI job by id, failed/running → pending)
- `cache.flush` (in-process auth/RBAC hot caches only)

**Must never:**

- DROP / ALTER / DELETE on business tables
- Trust or fee posting
- Password changes
- Editing source files
- Arbitrary SQL from the UI

Details: `docs/PHASE8_RUNTIME_HEAL.md`.

## 6. How patch proposals are applied

1. Diagnosis recommends `propose_patch` (or ops creates a proposal manually).
2. Ops creates a proposal → markdown under `docs/diagnostics/proposals/YYYYMMDD-….md`.
3. Human opens a PR or pastes a reviewed patch. **The running app does not write `src/` / `app/`.**
4. In Proposals: Approve plan → after merge, **Mark applied** (verify hook records smoke/typecheck notes + health recheck).
5. If undone outside the app, **Mark rolled back**.

Details: `docs/PHASE8_PATCH_PROPOSALS.md`.

## 7. Quick commands

```powershell
npx tsc --noEmit
npm run diagnostics:registry
npm run diagnostics:ui-anomalies
npm run smoke:phase8
```

Smoke needs a running app (`SMOKE_BASE_URL`, default `http://localhost:3000`).

## Related

- `docs/PHASE8_ADR.md`
- `docs/PHASE8_SMOKE_TEST.md`
- `docs/PHASE8_DIAGNOSIS.md`
- `docs/cloud/OPS_RUNBOOK.md` (hosting / Railway / portal; points here for diagnostics)
