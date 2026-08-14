# Admin guide

For Managing Partners and staff with firm administration permissions.

## Users and roles

Open **User access** (`/staff`). This is **platform access** (logins, roles, seats), not HR employment records. Only Managing Partners (permission `users.manage`) can create users.

- Invite a user with email, full name, role, and (optionally) a temporary password.
- **Leave the password blank to auto-generate a temporary password.** It is shown **once** in a callout after you create the user. Copy it and share it securely (never by unencrypted email if you can avoid it). It cannot be retrieved again.
- New users are flagged to **change their password on first login**. A prompt appears in the app until they set a new one.
- Seat limits come from your **licence edition**. If seats are full, deactivate someone or ask LexZim ops to raise seats.
- Solo edition often has one seat. You do not need to invite others.

### Password resets (approval-gated)

There is **no self-service email reset link**. Resets are approved by an admin so that account recovery stays under firm control.

1. On the login screen the user clicks **Forgot / request password reset** and submits their email. The screen always shows a generic confirmation (it never reveals whether the email exists).
2. This creates a **pending request** in **Settings → Security**.
3. A Managing Partner opens **Settings → Security**, reviews the request, and clicks **Approve & issue**. LexZim generates a new temporary password, shows it **once**, and forces the user to change it on next login.
4. Share the temporary password securely with the user. Use **Reject** for requests you do not recognise (for example an unknown email).

Every request, approval, and rejection is written to the audit log.

**HR staff records** (`/hr/staff`) are separate: employment profiles for everyone who works at the firm, including people without a LexZim login. Link a profile to a user when someone both works at the firm and uses LexZim. See `HR_Quickstart.md`.

Roles control what appears in the menu. Do not share Managing Partner accounts.

## HR administration

| Area | Path | Permission |
|------|------|------------|
| Staff records | `/hr/staff` | `hr.view` / `hr.manage` |
| Contracts | `/hr/contracts` | `hr.view` / `hr.manage` |
| Leave | `/hr/leave` | `hr.view` (submit own if linked); `hr.manage` (approve) |

**Payroll** (payslips, PAYE, NSSA) is **not** in Phase 6. Coming in **Phase 6B**. See `docs/PHASE6B_PAYROLL_HANDOFF.md`.

## Finance administration

Full desk guide: `Finance_Desk_Quickstart.md`.

Typical Accounts / MP permissions: `billing.*`, `trust.*`, `finance.view`, `finance.post`, `finance.reconcile`, `finance.close_month`, `hr.view`, `hr.manage`.

Lawyers usually keep matters and documents without full finance menus.

## Month-end checklist (Accounts / MP)

Complete in order near calendar month-end:

1. **Debtors** — `/finance/debtors`: review ageing; chase overdue fee notes. Export if needed.
2. **Invoice send** — `/finance/invoicing`: mark remaining drafts **sent**; email PDFs from the invoice page once SMTP is configured (`Email_Setup.md`).
3. **Trust three-way recon** — `/finance/reconciliations`: trust bank run for the month; variance zero before complete (or documented MP override). Confirm trust receipt **reference numbers** match the bank.
4. **Vault** — if the firm holds trust cash: vault count recon for the month.
5. **Business bank recon** — business operating account vs statement (`/finance/expenses` or reconciliations).
6. **AP ageing** — `/finance/creditors`: unpaid supplier bills; pay or note disputes.
7. **Petty cash** — `/finance/petty-cash`: float still open; transfers and spends posted.
8. **Expenses posted** — all firm costs for the month in `/finance/expenses`.
9. **Cashbook** — business bank movements match bank statement where applicable.
10. **GL trial balance** — `/finance/gl` (or trial balance report): debits equal credits as of month-end. Export PDF/Excel for the bookkeeper.
11. **P&L and balance sheet** — same GL desk; review gross profit and equity. Compare to cash P&L on **Finance → Reports** if you still use that pack.
12. **Lock period** — **Finance → Reports → Monthly close → Lock period** (`finance.close_month`). Locked months block new expenses and cashbook entries dated in that month.
13. **HR** — leave approved; contracts current for key staff (optional but recommended). Payroll remains Phase 6B.

Reopen a locked period is not in self-service UI v1; contact LexZim support if a correction is required (audited).

## Licence

Open **Settings → Licence**.

| Edition | Typical fit |
|---------|-------------|
| Trial | Short evaluation with matter caps |
| Solo | Small practice, limited seats |
| Firm | Multi-user practice, broader features |

If a licence **expires** or is **revoked**:

- New matters may be blocked.
- **Export always remains available.** Your data is not held hostage.

Contact LexZim ops to renew or upgrade. Do not edit licence rows by hand in the database.

## Firm profile and billing prefs

**Settings → Firm profile**:

- Firm name and contact details
- Default currency
- Invoice (fee note) prefix and due days

Saving the profile marks the onboarding “firm profile” step complete. It does not turn on AI web lookup or telemetry.

## Backup and export

**Settings → Backup & Export**.

- Download a firm archive (JSON snapshot plus file path inventory).
- Store the file somewhere secure. It contains confidential client and matter data.
- Binary files in storage are listed by path. Full file restore is support-assisted in the MVP.
- Export works even when the licence is expired.

Schedule a regular export (for example weekly) as part of firm risk management.

## Email (outbound)

**Settings → Email** (permission `settings.manage`).

Configure your firm SMTP server so LexZim can email documents to clients:

- **SMTP server**: host, port (587 for STARTTLS, 465 for SSL/TLS), username, password.
- **Sender identity**: from name, from email, and optional reply-to.
- The SMTP **password is stored encrypted** and is never sent back to the browser. Leaving the password blank on save keeps the existing one.
- Use **Send test email** to confirm the settings work before sending real documents.

Once configured, you can send documents as **PDF attachments**:

- **Quotation, invoice, receipt** detail pages have a **Send email** action. It defaults to the client's email on file; you can override the recipient and add a short note.
- **Client profile** has an **Email client** button (Managing Partner or accounts) for a generic notification to the client's email.

Every send is written to the audit log as `email.sent` with the recipient, template type, and entity id. SMTP secrets are never exposed to the browser or included in firm exports.

If no firm SMTP is configured, a managed relay may be used when the deployment provides `SMTP_HOST` / `SMTP_FROM` server env. Firm SMTP always wins over the server relay.

## AI settings

**Settings → AI** (needs AI manage permission).

- Choose provider (Gemini, Claude, or OpenAI) and routing mode.
- Prefer firm BYO keys or the managed server keys your host configured.
- Soft monthly budgets can pause new LLM calls when the budget is hit.
- **Web lookup stays off** unless you enable it on purpose.
- Matter context for AI can be disabled firm-wide if you prefer.

See `AI_Assistant_Guide.md` for day-to-day use.

## About and version

**Settings → About** shows app version, edition, and knowledge pack status. Useful when you contact support.

## Onboarding checklist

The Dashboard checklist is optional. Dismiss or restore it anytime. Details: `docs/ONBOARDING.md` (technical) and `Getting_Started_Web.md` (user).

## What admins should not do

- Mix trust ledger entries with fee payments
- Post firm expenses or cashbook entries against client trust
- Share API keys in chat, email, or tickets without redaction
- Rely on AI as the sole source for court filings or advice
- Expect payroll or statutory payslip engines in Phase 6 (Phase 6B)
