# Phase 6 smoke test (Finance desk & HR)

Use after P6-01 through P6-14. Confirms fee/trust separation, finance desk flows, HR, and RBAC.

```powershell
npm run dev

# Seeds (once per environment):
$env:DEV_SEED_ENABLED = "1"
npm run db:seed:dev-users
npm run db:seed:rbac
npm run db:seed:phase1-demo
npm run db:seed:phase3-demo

# Apply Phase 6 migrations if not already:
npm run db:migrate

# Optional Railway:
# $env:SMOKE_BASE_URL = "https://YOUR-APP.up.railway.app"
```

Re-seed RBAC after permission matrix changes: `npm run db:seed:rbac`.

## Credentials (dev)

| User | Email | Password | Role |
|------|-------|----------|------|
| Managing Partner | `mp@lexzim.local` | `<set-in-env>` | Full access |
| Accounts | `accounts@lexzim.local` | `<set-in-env>` | Finance + HR view/manage |
| Secretary | `secretary@lexzim.local` | `<set-in-env>` | No finance / no HR |
| Junior (if seeded) | `junior@lexzim.local` | `<set-in-env>` | Matters only |

## Manual checklist

| # | Check | How | Pass? |
|---|-------|-----|-------|
| 1 | Fee invoice + payment never hits trust | Create/send fee note → record **fee payment** → confirm **Trust** client balance unchanged | |
| 2 | Trust receipt + client balance | **Finance → Trust** → trust receipt for client → running balance updates on client ledger | |
| 3 | Vault receive + bank-in | Vault tab: receive cash → vault balance up → **bank-in** to master trust bank → vault down, bank up | |
| 4 | Three-way trust recon complete | **Reconciliations** → trust bank preview → create draft → complete with statement balance (variance 0 or MP override) | |
| 5 | Business bank recon | **Expenses** tab business recon OR **Reconciliations** → business bank run for month | |
| 6 | Expense + cashbook + P&L | Post firm **expense** and cashbook **out** → **Finance → Reports → Monthly close** shows expense and profit moves | |
| 7 | Debtors ageing | **Finance → Debtors** → buckets by due date; CSV export | |
| 8 | Period lock | **Reports → Monthly close → Lock period** → try new expense in locked month → blocked | |
| 9 | HR profile + contract | **HR → Staff records** → add non-login staff → **Contracts** → add contract + upload PDF | |
| 10 | Leave approve | **HR → Leave** → submit request → Accounts/MP **Approve** → appears on **Who is away** | |
| 11 | RBAC: secretary denied | Login secretary → no **Finance** or **HR** nav; `/api/finance/debtors` returns 403 | |
| 12 | RBAC: accounts finance | Login accounts → Finance submenus + HR; can post expense if `finance.post` | |
| 13 | User access ≠ HR | **User access** (`/staff`) still manages logins; **HR staff** is separate label | |
| 14 | Aliases work | `/billing` and `/trust` open same desks as `/finance/invoicing` and `/finance/trust` | |
| 15 | Audit | After fee payment, trust receipt, recon complete, expense, leave approve: entries in audit log (if `audit.view`) | |

## API spot checks (optional)

| Endpoint | User | Expect |
|----------|------|--------|
| `GET /api/finance/debtors` | Accounts | 200 JSON |
| `GET /api/finance/debtors` | Secretary | 403 |
| `GET /api/finance/kpis` | MP | 200 JSON |
| `GET /api/hr/staff` | Accounts | 200 JSON |
| `GET /api/hr/staff` | Secretary | 403 |
| `POST /api/hr/leave-requests` | Accounts (linked profile) or MP | 201 for valid body |

## Regression (prior phases)

```powershell
npm run smoke:phase3
npm run smoke:phase5
```

Phase 3 smoke already checks fee vs trust API separation. Phase 5 checks portal and export.

## Docs to verify exist

| Doc | Purpose |
|-----|---------|
| `docs/user/Finance_Desk_Quickstart.md` | End-user finance desk |
| `docs/user/HR_Quickstart.md` | HR records, contracts, leave |
| `docs/user/Admin_Guide.md` | Month-end checklist |
| `docs/PHASE6B_PAYROLL_HANDOFF.md` | Payroll deferred handoff |
| `docs/FINANCE_HR_ADR.md` | Architecture |
| `docs/REPORTS.md` | Finance reports pack |

## Final statement

**PHASE 6 COMPLETE — practice finance desk and HR v1 available; payroll deferred to Phase 6B**

See `docs/ROADMAP_STATUS.md`.
