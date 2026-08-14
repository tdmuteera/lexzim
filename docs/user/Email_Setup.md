# Email setup

LexZim sends quotations, invoices, receipts (PDF attached), and one-off client notes through **your firm SMTP**. Secrets never appear in the browser.

Path: **Settings → Email**. Permission: `settings.manage`.

## Firm SMTP (recommended)

1. Enter host, port (587 STARTTLS or 465 SSL/TLS), username, and password.
2. Set **from name**, **from email**, and optional **reply-to**.
3. Save. Leave password blank on later saves to keep the stored password.
4. **Send test email** to yourself before sending client documents.

The password is stored encrypted (same vault as BYO AI keys) and is stripped from firm backup exports.

## Managed relay

If the firm has no SMTP yet, a deployment may provide a shared relay (`SMTP_HOST` and `SMTP_FROM` on the server). Firm settings always win when both exist. Ask LexZim ops if test send says email is not configured.

## Sending documents

| Where | Action |
|-------|--------|
| Quotation, invoice, or receipt page | **Send email**: PDF attachment; defaults to the client email |
| Client profile | **Email client** (Managing Partner or accounts): free-text note |

Every send is audited (`email.sent`) with recipient, template type, and document id.

## Related

- `Admin_Guide.md`
- `Security_Password_Policy.md` (password resets are not sent by email)
- `docs/EMAIL.md` (technical: BYO vs env)
