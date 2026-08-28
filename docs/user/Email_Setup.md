# Email setup

LexZim sends quotations, invoices, receipts (PDF attached), and one-off client notes through **your firm SMTP**. Secrets never appear in the browser. Sending is always **manual**: review the recipient, subject, note, and attachment, then click Send. LexZim does not auto-email clients.

Path: **Settings → Email**. Permission: `settings.manage`.

## Firm SMTP (recommended)

1. Enter host, port (587 STARTTLS or 465 SSL/TLS), username, and password.
2. Set **from name**, **from email**, and optional **reply-to** (use placeholders like `name@yourfirm.co.zw`; save the address your firm actually uses).
3. Save. Leave password blank on later saves to keep the stored password.
4. **Send test email** to yourself before sending client documents.

The password is stored encrypted (same vault as BYO AI keys) and is stripped from firm backup exports.

For the T Pfigu Attorneys pilot, set From/Reply-To in **that firm’s Settings** to the address the partner provides after SMTP credentials arrive. LexZim does not apply a pilot address as a default for other firms.

## Managed relay (Railway / ops)

If the firm has no SMTP yet, a deployment may provide a shared relay (`SMTP_HOST`, `SMTP_FROM`, and related `SMTP_*` on Railway Variables). Firm settings always win when both exist. Never commit passwords to git. Ask LexZim ops if test send says email is not configured.

## Sending documents

| Where | Action |
|-------|--------|
| Quotation, invoice, or receipt page | **Send email**: review To, Subject, note, PDF attachment name; click Send |
| Client profile | **Email client** (Managing Partner or accounts): free-text note with editable subject |

Every send is audited (`email.sent`) with recipient, subject, template type, and status. Failures may log `email.failed` and always return a safe error with a reference id.

## Related

- `Admin_Guide.md`
- `Security_Password_Policy.md` (password resets are not sent by email)
- `docs/EMAIL.md` (technical: BYO vs env, Railway SMTP)
- `docs/RAILWAY.md` (deploy Variables including optional SMTP)
