# Admin guide

For Managing Partners and staff with firm administration permissions.

## Users and roles

Open **User access** (`/staff`). This is **platform access** (logins, roles, seats), not HR employment records.

- Invite a user with email, full name, temporary password, and role.
- Seat limits come from your **licence edition**. If seats are full, deactivate someone or ask LexZim ops to raise seats.
- Solo edition often has one seat. You do not need to invite others.

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

1. **Debtors** — `/finance/debtors`: review ageing; chase overdue fee notes.
2. **Outstanding invoices** — `/finance/reports` weekly pack or invoicing list.
3. **Trust three-way recon** — `/finance/reconciliations`: trust bank run for the month; variance zero before complete (or documented MP override).
4. **Vault** — if the firm holds trust cash: vault count recon for the month.
5. **Business bank recon** — business operating account vs statement (`/finance/expenses` or reconciliations).
6. **Expenses posted** — all firm costs for the month in `/finance/expenses`.
7. **Cashbook** — business bank movements match bank statement where applicable.
8. **Monthly P&L** — `/finance/reports` → Monthly close: review income (payments received) and expenses.
9. **Lock period** — same screen: **Lock period** when satisfied (`finance.close_month`). Locked months block new expenses and cashbook entries dated in that month.
10. **HR** — leave approved; contracts current for key staff (optional but recommended).

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
