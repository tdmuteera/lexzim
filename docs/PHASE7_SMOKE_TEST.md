# Phase 7 smoke test (Practice Suite)

Use after P7-01 through P7-12. Confirms GL, KYC, quotations, trust/AP/petty cash, CRM, dashboard meetings, email, and password-reset approval. **Payroll is out of scope.**

```powershell
npm run db:migrate
npm run db:seed:rbac
npm run dev

# Seeds (once per environment):
$env:DEV_SEED_ENABLED = "1"
npm run db:seed:dev-users

# CI without SMTP: set on the Next.js process
# $env:EMAIL_MOCK = "1"

# Optional:
# $env:SMOKE_BASE_URL = "https://YOUR-APP.up.railway.app"

npm run smoke:phase7
```

Re-seed RBAC after permission matrix changes: `npm run db:seed:rbac`.

## Credentials (dev)

| User | Email | Password | Role |
|------|-------|----------|------|
| Managing Partner | `mp@lexzim.local` | `<set-in-env>` | Full access |
| Accounts | `accounts@lexzim.local` | `<set-in-env>` | Finance |
| Secretary | `secretary@lexzim.local` | `<set-in-env>` | No finance / no users.manage |

## Automated checks (`npm run smoke:phase7`)

| # | Check |
|---|-------|
| 1 | Create client with KYC compulsory fields; CL number `CL####` |
| 2 | Quote → mark sent → convert invoice → mark sent → fee payment + receipt |
| 3 | GL trial balance debits equal credits after fee flow |
| 4 | Trust receipt with reference; GL 2100 trust liability has a credit |
| 5 | Petty cash float (open if needed) + vault-to-petty transfer |
| 6 | Creditor + bill + payment |
| 7 | Export debtors PDF/DOCX/XLSX and trial balance PDF/XLSX |
| 8 | CRM birthday appears for the client DOB (this month) |
| 9 | Calendar meeting appears on dashboard upcoming meetings |
| 10 | Email test send (200, or 400 not configured / `EMAIL_MOCK=1`) |
| 11 | Password reset request + MP queue + approve (temp password once); reject fallback if seats full |
| 12 | RBAC: secretary denied GL, staff list, email settings, user create |

## Manual checklist (optional)

| # | Check | How | Pass? |
|---|-------|-----|-------|
| 1 | KYC wizard | `/clients/new`: phone + WhatsApp required; individual needs first name + surname | |
| 2 | Quote PDF email | Quotation detail → Send email (needs SMTP or EMAIL_MOCK) | |
| 3 | Invoice / receipt email | Invoice detail and payment row Email buttons | |
| 4 | Email client | Client profile (MP/accounts) | |
| 5 | Settings → Email | Save SMTP; password never echoed | |
| 6 | Settings → Security | Pending reset queue | |
| 7 | Month-end | Trial balance, trust three-way, AP ageing, invoice send, recon (`Admin_Guide.md`) | |
| 8 | Lawyer performance | Dashboard caseload / revenue; `/reports/lawyer-performance` | |

## Docs to verify exist

| Doc | Purpose |
|-----|---------|
| `docs/user/Finance_Phase7_Guide.md` | Quotes, GL, creditors, petty cash |
| `docs/user/Clients_KYC_Guide.md` | CL numbers + KYC |
| `docs/user/CRM_Guide.md` | Birthdays |
| `docs/user/Email_Setup.md` | SMTP |
| `docs/user/Security_Password_Policy.md` | Users and resets |
| `docs/user/Admin_Guide.md` | Month-end checklist |
| `docs/EMAIL.md` | BYO vs env vs EMAIL_MOCK |
| `docs/PHASE6B_PAYROLL_HANDOFF.md` | Payroll still deferred |
| `docs/FINANCE_HR_ADR.md` | Phase 6 “no full GL” superseded by Phase 7 |

## Regression

```powershell
npm run smoke:phase3
npm run smoke:phase5
```

## Definition of done (Phase 7 §6)

See `PHASE 7 - Practice Suite Prompts.md` section 6. All boxes are satisfied by P7-01 through P7-12. Payroll remains Phase 6B.
