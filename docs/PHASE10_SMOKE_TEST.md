# Phase 10 smoke

`npm run smoke:phase10`

Needs the app running (`SMOKE_BASE_URL`, default `http://localhost:3000`) and Managing Partner credentials (`SMOKE_MP_EMAIL` / `SMOKE_MP_PASSWORD`). Static file checks (idle timeout, purge guard, calendar default, email hardcode) run without a live server; API checks need login.

Optional second user for calendar privacy: `SMOKE_OTHER_EMAIL` / `SMOKE_OTHER_PASSWORD` (same firm, calendar.view). If missing, the script asserts private default in `lib/calendar/validation.ts` and skips the cross-user list check with a clear skip message.

## Automated

1. **Idle timeout:** `lib/auth/idle-timeout.ts` contains `STAFF_IDLE` and default `30 * 60 * 1000` (optional `NEXT_PUBLIC_STAFF_IDLE_TIMEOUT_MS` documented for local smoke only).
2. **Platform purge guard:** `app/api/platform/clients/purge/route.ts` calls `requireOpsAccess` (ops/platform only; not firm product UI).
3. **Invoice shape:** MP GET `/api/invoices` (and one detail if present) includes `approvalState`; lines expose optional `workDate` (may be null).
4. **Tasks:** MP POST `/api/workflow/tasks` then PATCH complete (`action: complete`).
5. **Calendar privacy:** MP creates a private event (title + location). With `SMOKE_OTHER_*`, firm/shared scopes must not return that event for the other user; otherwise code-level private default assert.
6. **Email From:** GET `/api/settings/email` returns `fromEmail` from firm settings; `lib/email` source must not hardcode `info@tpfiguattorneys.com` as a default.
7. **HR advances / payroll:** GET `/api/hr/salary-advances` and `/api/hr/payroll/periods` return 200 for MP. Full approve → payroll deduction remains manual.

## Manual checklist

- [ ] Idle: leave staff web idle ~30 minutes (or lower `NEXT_PUBLIC_STAFF_IDLE_TIMEOUT_MS` for a short local test); confirm logout and login `?reason=idle` message.
- [ ] Archive a test client: finance retained; outstanding KPIs exclude archived where designed. Confirm there is **no** firm-product hard purge; platform purge is Ops only with typed phrase.
- [ ] Invoice: draft → submit for approval → approve → send; line work dates optional (blank ok); banking note at 9pt on export.
- [ ] Salary advance: request → approve (or reject); payroll period generate / mark paid recovers advance (MVP, not full PAYE).
- [ ] Tasks: assign to a colleague, complete with optional feedback; approvals inbox shows pending items.
- [ ] Calendar: create Private event; other user does not see it on Firm/Shared; share with Firm or Specific people and confirm visibility. Day click opens create; title and location required. My / Firm / Shared tabs.
- [ ] Email: Settings From is this firm’s address; compose shows To / Subject / note / attachment; Send is explicit (no auto client mail).
- [ ] Conflict: new client conflict result Clear / Potential / Blocked; Blocked gates opening a matter. Soft archive vs platform purge understood.
- [ ] AI: legal answer shows citations / verify behaviour; disclaimer; no zero-hallucination claim.

## Railway partner regression (after agreed push)

Do **not** treat this closeout as a push. After the partner agrees and `master` is pushed:

1. Confirm Railway deploy healthy (`/api/health` or ops health).
2. Spot-check idle logout, invoice approval send gate, private calendar, manual email Send, HR advances list, tasks.
3. Confirm pilot firm From address is set in **that firm’s Settings** only.
4. Sign off Phase 10 on `docs/ROADMAP_STATUS.md` when satisfied.

Related: `docs/PHASE10_ADR.md`, `docs/PHASE11_CANDIDATES.md`, `docs/ROADMAP_STATUS.md`.
