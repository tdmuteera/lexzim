# Email setup

LexZim sends quotations, invoices, receipts (PDF attached), and one-off client notes through **your firm SMTP**. Secrets never appear in the browser. Sending is always **manual**: review the recipient, subject, note, and attachment, then click Send. LexZim does not auto-email clients.

Path: **Settings → Email**. Permission: `settings.manage`.

## Firm SMTP (recommended)

1. Enter host, port (587 STARTTLS or 465 SSL/TLS), username, and password.
2. Set **from name**, **from email**, and optional **reply-to** (use placeholders like `name@yourfirm.co.zw`; save the address your firm actually uses).
3. Save. Leave password blank on later saves to keep the stored password.
4. **Send test email** to yourself before sending client documents.

The password is stored encrypted (same vault as BYO AI keys) and is stripped from firm backup exports.

For the **T Pfigu Attorneys** pilot, use the firm cPanel mailbox below in **Settings → Email** (permission `settings.manage`).

| Field | Value |
|---|---|
| SMTP host | `mail.tpfiguattorneys.com` |
| Port | `465` |
| SSL/TLS | On (secure connection) |
| Username | `info@tpfiguattorneys.com` |
| Password | The mailbox password (never commit or paste into chat) |
| From name | `T Pfigu Attorneys` |
| From email | `info@tpfiguattorneys.com` |
| Reply-to | `info@tpfiguattorneys.com` (optional, same address) |

**Incoming mail (Outlook/phone only):** IMAP `mail.tpfiguattorneys.com` port **993** (SSL). LexZim does not read inbound mail; it only **sends** via SMTP.

**Calendar/Contacts (CalDAV/CardDAV):** LexZim uses its built-in calendar. cPanel CalDAV URLs are for Apple/Google/Outlook sync outside LexZim, not for LexZim email setup.

Ops can seed non-secret SMTP fields with:

```bash
# optional: T_PFIGU_SMTP_PASSWORD=... npx tsx scripts/set-tpfigu-email-smtp.ts
npx tsx scripts/set-tpfigu-email-smtp.ts
```

Then enter the mailbox password once in **Settings → Email** if it was not passed via env.

### Railway and outbound SMTP (important)

Railway **blocks outbound SMTP on Free, Trial, and Hobby plans**. Connecting to `mail.tpfiguattorneys.com` on port 465 or 587 will time out even when credentials are correct.

**Option A (keep cPanel SMTP):** Upgrade the LexZim Railway project to **Pro**, then **redeploy** the service. After redeploy, use the same firm settings (host `mail.tpfiguattorneys.com`, port 465, SSL/TLS on). Railway docs: [Outbound networking](https://docs.railway.com/networking/outbound-networking).

**Option B (stay on Hobby):** Use a transactional email provider with an **HTTPS API** (Resend, SendGrid, Brevo). LexZim today sends via SMTP only; API relay integration is the long-term path for Hobby plans.

**If already on Pro and still failing:** In Railway Shell, test reachability to your mail host. Try port **587** with **SSL/TLS unchecked** in Settings → Email. Confirm cPanel allows connections from Railway IPs.

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
