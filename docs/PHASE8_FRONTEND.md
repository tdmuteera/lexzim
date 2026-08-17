# Phase 8 frontend diagnostics (P8-09)

Browser failures join the same `requestId` timeline as API events. No marketing analytics.

## Pieces

| Piece | Path |
|-------|------|
| Client helpers | `lib/diagnostics/client.ts` |
| Client event API | `POST /api/diagnostics/client-event` |
| Error boundaries | `app/error.tsx`, `app/(platform)/error.tsx`, `components/system/AppErrorPanel.tsx` |
| Listeners | Installed once from `AuthProvider` |

## Helpers

- `ensureRequestId()` / `rememberRequestId()`: sessionStorage correlation id
- `diagnosticFetch()`: sends `X-Request-Id`, reads it back
- `diagnosticJson<T>()`: parse `{ ok, data, error, requestId }` and surface the reference
- `errorMessageWithRef(message, requestId)`: for toasts and banners
- `reportClientDiagnostic(...)`: fire-and-forget POST (never throws)
- `installFrontendDiagnostics()`: `window.error` + `unhandledrejection`

## Client event API

- Auth: firm staff session **or** platform ops (`requireOpsAccess`)
- Rate limit: 30 / actor+IP / minute (`lib/ops/rate-limit.ts`)
- Persists `source=frontend`, redacted message, page path, `requestId`
- Rejects payload keys that look like cookies, tokens, form bodies, stacks, KYC, amounts

## Wired screens (minimum set)

- Login (`components/auth/LoginForm.tsx`)
- Dashboard load (`components/dashboard/DashboardView.tsx`)
- Finance invoice create (`components/billing/InvoiceFormView.tsx`)
- Matter save (`components/matters/MatterForm.tsx`)

Failed responses show a safe message plus **Reference: {requestId}** when present.

## Adopt on other screens

```ts
import { diagnosticJson } from "@/lib/diagnostics/client";
import { useToast } from "@/components/ui/Toast";
import { errorMessageWithRef } from "@/lib/diagnostics/client";

const { toast } = useToast();
const result = await diagnosticJson("/api/your-route", { method: "POST", body: JSON.stringify(payload) });
if (!result.ok) {
  setError(result.error?.message ?? "Request failed.");
  setErrorRef(result.requestId); // or:
  toast(errorMessageWithRef(result.error?.message ?? "Request failed.", result.requestId));
  return;
}
```

Prefer `diagnosticJson` / `diagnosticFetch` over raw `fetch` for mutating or critical loads. Do not redesign every form in one pass.

## Ops lookup

Paste the reference into `/ops/diagnostics` → Events. Frontend rows have `source=frontend`.

## Layout anomalies (P8-10)

`lib/diagnostics/ui-anomalies.ts` + `UiAnomalyProbe` on dashboard, finance layout, and reports.

| Code | Meaning |
|------|---------|
| `ui.overflow_clip` | Content taller than box with `overflow: hidden` / `clip` |
| `ui.chart_label_hidden` | Bar labels missing, off-canvas, or too close to background |
| `ui.controlled_input` | React uncontrolled↔controlled console warning (cosmetic) |

At most one emit per code per page path per session. Run `npm run diagnostics:ui-anomalies` for helper + CSS regression checks. See `docs/PHASE8_SMOKE_TEST.md`.
