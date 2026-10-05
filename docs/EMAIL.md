# Outbound email + user security (P7-11 / P10-14)

LexZim sends transactional documents (quotations, invoices, receipts) and generic client notifications by email, and gates password recovery behind admin approval.

**Client greetings:** birthday emails from CRM are **craft-then-send** (staff write the message, then click Send). They are not silent cron campaigns.

**Staff workflow emails are automatic** (in-app + SMTP via `notifyStaffEvent`). Tasks and invoice approval email as soon as they are created. A requisition emails as soon as it is submitted, and only to people who can approve requisitions. Being able to open Requisitions and request money does not put someone on that email. Calendar events do not email on create.

## Calendar event reminder emails (cron)

Endpoint: `GET`/`POST` `/api/cron/calendar-event-emails`  
Auth: `Authorization: Bearer $CRON_SECRET`

Timezone: **Africa/Harare**. The only calendar email is **08:00 on the day of the event**. There is no email when the event is created, no email the day before, and no 30-minute reminder. A postponement still emails immediately, because the time has changed.

Recipients: creator + shared staff (LexZim staff emails). Optional external/client guests get the same day-of reminder as a firm-branded email (no LexZim CTA) with **Created by**.

Railway: add `CRON_SECRET`, then schedule one HTTP job during the 08:00 Harare hour (06:00 UTC). Extra calls that same morning do not send a second copy.

| UTC time | Harare | What sends |
|---|---|---|
| 06:00 | 08:00 | reminder for events happening that day |

Production URL (T Pfigu pilot): `https://lexzim-production.up.railway.app/api/cron/calendar-event-emails`  
Header: `Authorization: Bearer $CRON_SECRET`

Local helpers (secrets stay out of git):
- `.env.railway` + `ops-calendar-cron-handoff.md` (generated secret + copy-paste)
- `powershell -File scripts/push-cron-secret.ps1` after `npx @railway/cli login` and `link`

Manual test: `?forceSlot=day_of` with the same Bearer token. `day_before` and `thirty_before` are ignored.

## Email transport: firm BYO vs server env

We use **nodemailer** with SMTP. There are two ways to configure a transport, resolved in this order:

1. **Firm BYO SMTP (preferred).** Configured per firm in **Settings → Email** and stored in `firm_settings`:
   - `email_smtp_host`, `email_smtp_port`, `email_smtp_secure`, `email_smtp_user`
   - `email_smtp_password` (encrypted with the same AES-256-GCM vault as BYO AI keys; never returned to the browser)
   - `email_from_name`, `email_from_email`, `email_reply_to`
2. **Server env relay (fallback).** If a firm has no SMTP configured, LexZim falls back to a shared relay when the deployment provides:
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_REPLY_TO`

**EMAIL_MOCK=1** (or `SMTP_MOCK=1`) uses nodemailer `jsonTransport` so CI and `npm run smoke:phase7` can exercise send paths without a live SMTP server.

**Why BYO-first?** Each firm sends from its own domain/deliverability reputation and keeps control of credentials. The env relay exists so managed/pilot deployments can offer email without every firm configuring SMTP first. (Resend or another API provider could be swapped in behind `lib/email/mailer.ts` without changing callers.)

### Railway SMTP (pilot)

Prefer firm **Settings → Email** BYO SMTP for production pilots. Optional shared relay: set `SMTP_*` on Railway **Variables** (never commit passwords). Use `EMAIL_MOCK=1` for CI only.

For the **T Pfigu Attorneys** pilot, set that firm’s From/Reply-To in **that firm’s Settings** after credentials arrive (commonly their public info mailbox). LexZim never hardcodes a pilot address as a global default for other tenants.

### Secret handling

- The SMTP password is encrypted at rest via `encryptByoKey` / `decryptByoKey` (`lib/ai/secrets.ts`).
- The public config endpoint returns only `passwordSet: boolean`, never the password.
- `firm_settings` keys matching `password` / `_key` / `secret` are excluded from firm exports (`isSensitiveSettingKey`).
- SMTP secrets are never sent to the browser.

## Code map

| Concern | File |
|---|---|
| Config get/set (encryption) | `lib/email/config.ts` |
| Transport + send + verify | `lib/email/mailer.ts` |
| Document recipient resolver | `lib/email/document-send.ts` |
| Settings API (GET/PUT) | `app/api/settings/email/route.ts` |
| Test send | `app/api/settings/email/test/route.ts` |
| Send document (PDF attach) + preview GET | `app/api/email/send/route.ts` |
| Generic client notification | `app/api/email/compose/route.ts` |
| Settings panel | `components/settings/EmailSettingsPanel.tsx` |
| Send button (docs) | `components/email/SendDocumentButton.tsx` |
| Email client button | `components/email/ClientEmailButton.tsx` |

## Send actions

- **Quotation / invoice / receipt** detail pages expose **Send email** (permission `billing.view`). Modal: editable To (prefilled from client email when known), editable Subject (default `{DocumentLabel} — {FirmName}`), optional body note, attachment filename preview, explicit **Send**. LexZim renders the document to PDF and attaches it.
- **Client profile** exposes **Email client** (permission `users.manage` or `billing.manage`) for a free-text notification (editable subject).

Every successful send writes `email.sent` with `{ recipient, subject, templateType, documentNumber, status: "sent", transport, messageId }`. Failed SMTP attempts after send write `email.failed` with a safe error message (no secrets). API errors always include `requestId` via the Phase 8 envelope.

## User security

### Provisioning

- Only `users.manage` (Managing Partner) can create users (`/api/staff`).
- A blank password auto-generates a temporary password (returned **once** in the API response, shown once in the UI) and sets `users.must_change_password = true` (`forceChange`, default on).
- `mustChangePassword` is surfaced in the session; `PasswordChangePrompt` shows a non-blocking banner until the user sets a new password via `/api/auth/change-password`.

### Password reset (approval-gated)

There is **no self-service email reset link**.

1. `POST /api/auth/reset-request` (public): user submits their email from the login screen. Response is always generic (no email enumeration). Creates a pending `password_reset_requests` row, linked to the user when the email maps to an active account.
2. `GET /api/security/reset-requests` (`users.manage`): firm queue of pending requests.
3. `POST /api/security/reset-requests` (`users.manage`): **approve** issues a temp password (via Supabase admin), shows it once, sets `must_change_password`, and audits `security.password_reset_approved`; **reject** closes the request (`security.password_reset_rejected`).

### Schema (migration `0024_phase7_email_security.sql`)

- `users.must_change_password boolean` (default false).
- `password_reset_requests`: `id, firm_id, user_id, email, status (pending|approved|rejected|cancelled), note, requested_at, resolved_at, resolved_by, ip_or_user_agent`.

Password material is never stored in `password_reset_requests`.
