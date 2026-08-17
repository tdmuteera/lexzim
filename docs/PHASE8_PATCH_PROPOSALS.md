# Phase 8 Patch proposals (P8-13)

Code repair is **proposal only**. LexZim writes redacted markdown under `docs/diagnostics/proposals/`. It never auto-edits `app/`, `components/`, or other production source from the running app.

## Create

`POST /api/ops/diagnostics/repair/propose` (`requireOpsAccess`)

Body:

```json
{
  "title": "Dashboard chart label visibility",
  "files": ["styles/tpfigu.css"],
  "rationale": "Rules diagnosis recommends propose_patch for ui.chart_label_hidden.",
  "requestId": "…",
  "test_plan": "npx tsc --noEmit; npm run diagnostics:ui-anomalies",
  "diagnosis_id": "…"
}
```

Effects:

1. Insert `diagnostic_repair_actions` with `kind=patch_proposal`, `status=proposed`, `action_code=patch.propose`
2. Write `docs/diagnostics/proposals/YYYYMMDD-{requestId}.md` (How to apply, test plan, rollback notes)
3. Optional reference unified diff when the text clearly matches a known regression (dashboard overflow / chart labels, or finance invoicing scroll)
4. Audit `diagnostics.patch_proposal.created`

## Status (human apply path)

`PATCH /api/ops/diagnostics/repair/propose` body `{ id, status }`

| Status | Meaning |
|---|---|
| `approved` | Human accepted the plan; still apply outside the app |
| `rejected` | Discard |
| `succeeded` | Human already applied the patch (PR merged). Verify hook runs |
| `rolled_back` | Human confirmed reverse patch outside the app |

### Verify hook (on `succeeded`)

- Runs `npm run diagnostics:ui-anomalies` (and optionally `npx tsc --noEmit` when `DIAGNOSTICS_VERIFY_TSC=1`)
- Rechecks ops health
- Stores a safe summary on `result_safe` and a follow-up diagnostic event

## UI

`/ops/diagnostics` → **Proposals** tab: create, list, view markdown, **Approve plan**, **Reject**, **Mark applied**, **Mark rolled back**. No “write to src/” control.

When a diagnosis recommends `propose_patch`, Events → Diagnosis offers **Create patch proposal**.

## Safety

- No Finance / HR / GL refactors from this prompt
- No trust or fee posting
- No silent production edits
