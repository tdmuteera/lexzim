# Outbound email + user security (P7-11)

LexZim sends transactional documents (quotations, invoices, receipts) and generic client notifications by email, and gates password recovery behind admin approval.

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
| Send document (PDF attach) | `app/api/email/send/route.ts` |
| Generic client notification | `app/api/email/compose/route.ts` |
| Settings panel | `components/settings/EmailSettingsPanel.tsx` |
| Send button (docs) | `components/email/SendDocumentButton.tsx` |
| Email client button | `components/email/ClientEmailButton.tsx` |

## Send actions

- **Quotation / invoice / receipt** detail pages expose **Send email** (permission `billing.view`). LexZim renders the document to PDF via the export engine and attaches it. Recipient defaults to the client email on file.
- **Client profile** exposes **Email client** (permission `users.manage` or `billing.manage`) for a free-text notification.

Every send writes an audit row: `email.sent` with `{ recipient, templateType, entityId, ... }`.

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
