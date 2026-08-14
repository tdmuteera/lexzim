# Reports

## Operational reports (P3)

Firm-scoped operational reports. Permission: **`reports.view` only**.

### Reports

| Type | Description |
|---|---|
| `ar-aging` | Outstanding **fee** invoice balances by due-date buckets (current, 1-30, 31-60, 61-90, 90+) |
| `time` | Time aggregated by lawyer or matter (filters: date range, lawyer, matter) |
| `trust-balances` | Trust account balances and balances by client (**not** fee AR) |
| `trust-movements` | Trust ledger lines in a date range |
| `workload` | Open matters (prospective / open / on_hold) by responsible lawyer |
| `upcoming` | Calendar events and open matter deadlines in a window (default next 30 days) |

Fee AR and Trust are always labeled separately. Trust reports never include `fee_payments`.

## Lawyer performance (P7-10)

Dedicated page: `/reports/lawyer-performance`. Permission: **`reports.view`**.

| Metric | Source |
|---|---|
| Open caseload | Count of open/prospective/on_hold matters grouped by `matters.responsible_lawyer_id` |
| Revenue | Sum of `fee_payments.amount_cents` where `paid_at` is in the period, attributed to the **invoice matter's current responsible lawyer** |

**Attribution policy (documented choice):** cash collected, not billed-on-issue, and not the timekeeper on invoice lines. If a matter's responsible lawyer changes, historical receipts follow the lawyer on the matter **now**.

Dashboard widgets (last 6 months): caseload for all `dashboard.view` users (scoped); revenue only with billing/reports/finance access.

MP / `finance.gl.view` sees an optional **GL variance** hint: cash collected vs GL revenue accounts (4000) for the same window. Mismatch is expected because GL posts on invoice send (accrual) while this report is cash.

### API

`GET /api/reports/lawyer-performance?from=&to=`

### Export

`GET /api/export/practice_report?format=pdf|docx|xlsx|csv&type=ar-aging|time|trust-balances|trust-movements|workload|upcoming&from=&to=&lawyerId=&matterId=&groupBy=`

The Reports page **Download** menu offers PDF, Word, Excel, and CSV for the currently selected report.

Lawyer performance: `GET /api/export/lawyer_performance?format=pdf|docx|xlsx|csv&from=&to=`

Finance weekly/monthly packs: `GET /api/export/finance_weekly` and `GET /api/export/finance_monthly`.

### UI

`/reports` with report selector, filters, refresh, and a **Download** menu (PDF, Word, Excel, CSV). Lawyer performance also has its own page with bar charts.

### API

`GET /api/reports/[type]?format=json|csv&from=&to=&lawyerId=&matterId=&clientId=&trustAccountId=&groupBy=lawyer|matter`

### CSV

UTF-8 CSV attachment `lexzim-{type}.csv`. Amounts are integer cents in CSV (display currency formatting is UI-only).

### Access

Roles with `reports.view`: Managing Partner, Senior Associate, Accounts (see `docs/RBAC.md`).

---

## Finance reports pack (P6-10)

Practice finance desk reports under **Finance → Reports**. Permission: **`finance.view`**. Month-end lock: **`finance.close_month`**.

### Weekly pack

Always available with an **as-of** date filter.

| Section | Source |
|---|---|
| Debtors / ageing | Reuses P6-05 debtors desk (`listDebtors`) |
| Outstanding invoices | Fee invoices with balance outstanding |
| Trust snapshot | Client balances + bank/vault account totals |
| Business cashbook | Book balance vs last completed business bank recon statement |

### Monthly close pack

Selected calendar month (`year`, `month`).

| Section | Source |
|---|---|
| Business bank recon summary | `finance_reconciliation_runs` (`business_bank`) |
| Trust three-way recon status | Completed/draft trust bank and vault runs for the month |
| Expenses | Firm operating expenses dated in the month |
| Simple P&L | Fee income = **payments received** in month (`fee_payments.paid_at`); expenses = firm expenses dated in month; profit = income minus expenses |
| Period lock | `finance_period_locks` when month is closed |
| Asset register (light) | `firm_assets` list when present (no depreciation) |

P&L uses **cash basis** on fee payments received, not accrual on invoices sent. Accrual AR remains on the debtors desk.

### UI

`/finance/reports` with Weekly pack and Monthly close tabs, CSV export, and lock-period action (when permitted).

### API

| Endpoint | Description |
|---|---|
| `GET /api/finance/reports?pack=weekly&asOf=&format=json\|csv` | Weekly finance pack |
| `GET /api/finance/reports?pack=monthly&year=&month=&format=json\|csv` | Monthly close pack |
| `GET /api/finance/period-locks` | List locked periods |
| `POST /api/finance/period-locks` | Lock a period (`finance.close_month`) |

CSV filenames: `lexzim-finance-weekly-{date}.csv`, `lexzim-finance-monthly-{year}-{month}.csv`.

Locked periods block new firm expenses and business cashbook entries dated in that month.

### Finance KPIs (P6-11)

Partner KPI surface at **Finance → Reports → Finance KPIs** tab. Permission: **`finance.view`**.

| KPI | Source |
|---|---|
| Fees billed vs collected (month) | Invoice `issue_date` vs `fee_payments.paid_at` |
| Debtors over 30 / 60 / 90 | Outstanding fee AR ageing buckets |
| Business bank cash | Cashbook book balance; last completed business recon statement when available |
| Trust vault total | Vault trust account balances |
| Monthly expenses / profit | Firm expenses + P6-10 P&amp;L definition |
| Matters opened / closed | `opened_at` / `closed_at` in calendar month |

`GET /api/finance/kpis?year=&month=`

Managing Partners with `finance.view` also see a compact KPI strip on the **Dashboard** (existing operational widgets unchanged).

### Next

**P6-12:** HR staff records and contracts.
