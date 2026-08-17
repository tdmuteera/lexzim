# Phase 8 smoke notes (Diagnostics)

Companion to automated checks. Phase 7 smoke remains the product closeout suite.

## Commands

```powershell
npm run diagnostics:registry
npm run diagnostics:ui-anomalies
npm run smoke:phase8
npx tsc --noEmit
```

`smoke:phase8` needs a running app (`SMOKE_BASE_URL`, default `http://localhost:3000`). It checks:

- `/api/health` returns 200 or 503 JSON with `ok` boolean
- `/api/db-status` never contains `postgres://`
- Failed login error envelope includes `requestId`
- Ops diagnostics APIs return 401/403 without platform admin
- Registry includes `/matters` and `/finance/trust`
- Workflows keep `finance.trust.receipt` distinct from `finance.payment.post`

`diagnostics:ui-anomalies` asserts pure detector helpers and CSS/markup regressions:

- Dashboard bar value/label styles use visible text color and sit under the bar (not `position:absolute` on the fill only)
- Finance invoicing form uses `finance-desk-view` + `panel-body` (scrollable panel body)

## Manual layout spot-check (regression)

| Check | How |
|-------|---|
| Dashboard chart labels | Open `/dashboard` with billing access. Value labels sit above bars; lawyer names under bars; both readable on the background. |
| Finance invoicing scroll | Open `/finance/invoicing/new`. Form content is inside `.panel-body`; long catalogue scrolls without clipping the page chrome. |
| Ops timeline | Trigger a layout warn only if a regression returns; paste `requestId` in `/ops/diagnostics` → Events (`source=frontend`, codes `ui.overflow_clip` / `ui.chart_label_hidden` / `ui.controlled_input`). |

Do not redesign dashboard or invoicing CSS unless a detector fires. Fix with a minimal CSS change and treat it as a regression, not a product rebuild.

## Frontend telemetry (P8-09)

See `docs/PHASE8_FRONTEND.md`. Login / dashboard / invoice create / matter save show **Reference: {requestId}** on failure.

## DevOps triage

See `docs/PHASE8_RUNBOOK.md`.
